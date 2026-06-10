import os, sys, time, random
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(".env.local")
UNSPLASH_KEY = os.environ["UNSPLASH_ACCESS_KEY"]
SUPABASE_URL = os.environ["EXPO_PUBLIC_SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
APP_NAME = "affiche"

DRY_RUN = "--dry-run" in sys.argv
MODE = "events" if "--events" in sys.argv else "venues"
POOL_SIZE = 12

TITLE_THEMES = [
    ("martini","martini cocktail glass"),("cocktail","cocktail bar moody"),
    ("wine","wine glasses bar"),("happy hour","happy hour drinks"),
    ("jazz","jazz club saxophone"),("blues","blues guitar live"),
    ("piano","grand piano stage"),("karaoke","karaoke microphone night"),
    ("open mic","open mic microphone"),("comedy","comedy club microphone"),
    ("trivia","pub trivia night"),("drag","drag performance stage"),
    ("cabaret","cabaret stage performer"),("country","country music guitar"),
    ("emo","punk band live"),("punk","punk rock live show"),
    ("rock","rock band live stage"),("techno","techno club dark"),
    ("house","house music dj"),("rave","rave neon crowd"),
    ("edm","edm festival lights"),("banda","latin party crowd"),
    ("reggaeton","reggaeton club night"),("afrobeat","afrobeats party crowd"),
    ("soca","caribbean carnival party"),("caribbean","caribbean party crowd"),
    ("pride","pride party celebration"),("throwback","retro party disco"),
    ("matinee","acoustic afternoon set"),("dj","dj decks nightclub"),
    ("live","live band stage"),
]
TYPE_THEMES = {
    "Nightclub":"nightclub crowd","Live Music":"live band stage",
    "Brewery":"craft beer brewery","Cocktail Bar":"cocktail bar moody",
    "Bar":"bar interior night","Sports":"stadium crowd",
    "Theatre":"theatre stage curtain","Entertainment":"event venue lights",
    "Outdoor":"outdoor festival","Culture":"art gallery interior",
}
FALLBACK = "toronto nightlife"
sb = create_client(SUPABASE_URL, SERVICE_KEY)
_cache = {}

def search(q):
    r = requests.get("https://api.unsplash.com/search/photos",
        params={"query":q,"per_page":POOL_SIZE,"orientation":"landscape","content_filter":"high"},
        headers={"Authorization":f"Client-ID {UNSPLASH_KEY}"},timeout=20)
    r.raise_for_status(); return r.json().get("results",[])

def get_pool(key, query):
    if key in _cache: return _cache[key]
    out = []
    for p in search(query):
        if not DRY_RUN:
            try: requests.get(p["links"]["download_location"],
                headers={"Authorization":f"Client-ID {UNSPLASH_KEY}"},timeout=10)
            except Exception: pass
        out.append({"url":p["urls"]["regular"],"name":p["user"]["name"],
            "profile":f'{p["user"]["links"]["html"]}?utm_source={APP_NAME}&utm_medium=referral',
            "download_location":p["links"]["download_location"]})
    _cache[key]=out; time.sleep(0.4); return out

def theme_for(title, vt):
    t=(title or "").lower()
    for kw,q in TITLE_THEMES:
        if kw in t: return kw,q
    if vt in TYPE_THEMES: return vt,TYPE_THEMES[vt]
    return "fallback",FALLBACK

def run_venues():
    venues=sb.table("venues").select("id,name,venue_type").execute().data
    buckets={}
    for v in venues:
        key,q=(v["venue_type"],TYPE_THEMES.get(v["venue_type"],FALLBACK))
        buckets.setdefault(key,{"q":q,"rows":[]})["rows"].append(v)
    print(f"venues: {len(venues)} across {len(buckets)} types")
    for key,d in buckets.items():
        pool=get_pool(key,d["q"])
        if not pool: print(f"  [skip] {key}"); continue
        last=None
        for v in d["rows"]:
            choices=[p for p in pool if p["url"]!=last] or pool
            pick=random.choice(choices); last=pick["url"]
            if DRY_RUN: print(f"  {v['name']} -> {pick['name']}")
            else: sb.table("venues").update({"poster_url":pick["url"],
                "poster_credit_name":pick["name"],"poster_credit_url":pick["profile"],
                "unsplash_download_location":pick["download_location"]}).eq("id",v["id"]).execute()
        if not DRY_RUN: print(f"  {key}: {len(d['rows'])} done")

def run_events():
    events=sb.table("venue_events").select("id,title,venue_id,source,poster_credit_name").execute().data
    venues={v["id"]:v for v in sb.table("venues").select("id,venue_type").execute().data}
    todo=[e for e in events if e.get("source")=="user" and e.get("venue_id") and not e.get("poster_credit_name")]
    buckets={}
    for e in todo:
        vt=(venues.get(e["venue_id"]) or {}).get("venue_type")
        key,q=theme_for(e["title"],vt)
        buckets.setdefault(key,{"q":q,"rows":[]})["rows"].append(e)
    print(f"events: {len(todo)} across {len(buckets)} themes")
    for key,d in buckets.items():
        pool=get_pool(key,d["q"])
        if not pool: print(f"  [skip] {key}"); continue
        last=None
        for e in d["rows"]:
            choices=[p for p in pool if p["url"]!=last] or pool
            pick=random.choice(choices); last=pick["url"]
            if DRY_RUN: print(f"  [{key}] {e['title'][:34]} -> {pick['name']}")
            else: sb.table("venue_events").update({"poster_url":pick["url"],
                "poster_credit_name":pick["name"],"poster_credit_url":pick["profile"],
                "unsplash_download_location":pick["download_location"]}).eq("id",e["id"]).execute()
        if not DRY_RUN: print(f"  {key}: {len(d['rows'])} done")

if __name__=="__main__":
    print(f"hotlink+attribution — MODE={MODE} DRY_RUN={DRY_RUN}")
    if MODE=="venues": run_venues()
    else: run_events()
    print("Done.")
