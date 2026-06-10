import os, sys, time, random
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(".env.local")

UNSPLASH_KEY = os.environ["UNSPLASH_ACCESS_KEY"]
SUPABASE_URL = os.environ["EXPO_PUBLIC_SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "venue-images"

DRY_RUN = "--dry-run" in sys.argv
DO_EVENTS = "--events" in sys.argv
POOL_SIZE = 10

CATEGORY_QUERIES = {
    "Nightclub":     ["nightclub crowd", "dj nightclub", "neon club dancefloor", "concert lights crowd"],
    "Live Music":    ["live band stage", "small concert venue", "guitarist live show", "indie concert crowd"],
    "Brewery":       ["craft beer brewery", "taproom interior", "beer flight bar", "brewery taps"],
    "Cocktail Bar":  ["cocktail bar moody", "bartender cocktail", "speakeasy interior", "whiskey bar dim"],
    "Bar":           ["bar interior night", "pub drinks friends", "bar counter evening", "lounge bar warm"],
    "Sports":        ["stadium crowd", "sports arena lights", "stadium night"],
    "Theatre":       ["theatre stage curtain", "performing arts hall", "theatre interior seats"],
    "Entertainment": ["event venue lights", "party crowd celebration", "entertainment stage"],
    "Outdoor":       ["outdoor festival", "park event summer", "outdoor concert crowd"],
    "Culture":       ["art gallery interior", "cultural event hall", "museum modern space"],
}
FALLBACK_QUERIES = ["toronto nightlife", "city night bar", "party crowd"]

sb = create_client(SUPABASE_URL, SERVICE_KEY)

def ensure_bucket():
    try:
        buckets = [b.name for b in sb.storage.list_buckets()]
        if BUCKET not in buckets:
            print(f"Creating public bucket '{BUCKET}'...")
            if not DRY_RUN:
                sb.storage.create_bucket(BUCKET, options={"public": True})
        else:
            print(f"Bucket '{BUCKET}' exists.")
    except Exception as e:
        print(f"[warn] bucket check failed ({e}); assuming it exists.")

def unsplash_search(query, per_page=10):
    r = requests.get("https://api.unsplash.com/search/photos",
        params={"query": query, "per_page": per_page, "orientation": "landscape", "content_filter": "high"},
        headers={"Authorization": f"Client-ID {UNSPLASH_KEY}"}, timeout=20)
    r.raise_for_status()
    return r.json().get("results", [])

def build_pool(category):
    queries = CATEGORY_QUERIES.get(category, FALLBACK_QUERIES)
    photos, seen = [], set()
    for q in queries:
        for p in unsplash_search(q, per_page=max(4, POOL_SIZE // len(queries) + 2)):
            if p["id"] in seen: continue
            seen.add(p["id"]); photos.append(p)
            if len(photos) >= POOL_SIZE: break
        if len(photos) >= POOL_SIZE: break
        time.sleep(0.4)
    pool = []
    slug = category.lower().replace(" ", "-")
    for i, p in enumerate(photos):
        img_url = p["urls"]["regular"]
        path = f"{slug}/{slug}-{i}-{p['id']}.jpg"
        if DRY_RUN:
            pool.append(path); print(f"   [{category}] {img_url[:60]}"); continue
        try:
            requests.get(p["links"]["download_location"], headers={"Authorization": f"Client-ID {UNSPLASH_KEY}"}, timeout=10)
        except Exception: pass
        img = requests.get(img_url, timeout=30).content
        try:
            sb.storage.from_(BUCKET).upload(path, img, {"content-type": "image/jpeg", "upsert": "true"})
        except Exception as e:
            if "Duplicate" not in str(e): print(f"   [warn] upload {path}: {e}")
        pool.append(sb.storage.from_(BUCKET).get_public_url(path))
    return pool

def assign(rows, urls):
    last = None
    for row in rows:
        choices = [u for u in urls if u != last] or urls
        url = random.choice(choices); last = url
        yield row, url

def backfill_venues():
    print("\n=== VENUES ===")
    venues = sb.table("venues").select("id,name,venue_type,poster_url").execute().data
    todo = [v for v in venues if not v.get("poster_url")]
    by_type = {}
    for v in todo: by_type.setdefault(v.get("venue_type") or "Bar", []).append(v)
    print(f"{len(todo)} venues need an image across {len(by_type)} types.")
    for cat, rows in by_type.items():
        print(f"\n[{cat}] {len(rows)} venues — building pool...")
        urls = build_pool(cat)
        if not urls: print(f"   [skip] no images for {cat}"); continue
        for v, url in assign(rows, urls):
            if DRY_RUN: print(f"   would set {v['name']} -> {url[:60]}")
            else: sb.table("venues").update({"poster_url": url}).eq("id", v["id"]).execute()
        print(f"   done {len(rows)} {cat} venues.")

def backfill_events():
    print("\n=== EVENTS ===")
    events = sb.table("venue_events").select("id,title,poster_url,venue_id").execute().data
    todo = [e for e in events if not e.get("poster_url") and e.get("venue_id")]
    venues = {v["id"]: v for v in sb.table("venues").select("id,venue_type").execute().data}
    by_type = {}
    for e in todo:
        cat = (venues.get(e["venue_id"]) or {}).get("venue_type") or "Bar"
        by_type.setdefault(cat, []).append(e)
    print(f"{len(todo)} events need an image across {len(by_type)} types.")
    for cat, rows in by_type.items():
        print(f"\n[{cat}] {len(rows)} events — building pool...")
        urls = build_pool(cat)
        if not urls: print(f"   [skip] no images for {cat}"); continue
        for e, url in assign(rows, urls):
            if DRY_RUN: print(f"   would set {e['title'][:40]} -> {url[:50]}")
            else: sb.table("venue_events").update({"poster_url": url}).eq("id", e["id"]).execute()
        print(f"   done {len(rows)} {cat} events.")

if __name__ == "__main__":
    print(f"affiche image backfill — DRY_RUN={DRY_RUN}, EVENTS={DO_EVENTS}")
    ensure_bucket()
    backfill_venues()
    if DO_EVENTS: backfill_events()
    print("\nDone.")
