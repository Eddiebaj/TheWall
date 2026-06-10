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
POOL_SIZE = 12

TITLE_THEMES = [
    ("martini",   ["martini cocktail glass","martini bar elegant","classic martini drink"]),
    ("cocktail",  ["cocktail bar moody","craft cocktail closeup","mixology bar"]),
    ("wine",      ["wine glasses bar","wine tasting evening","red wine pour"]),
    ("happy hour",["happy hour drinks","bar drinks friends","cocktails on bar"]),
    ("jazz",      ["jazz club saxophone","jazz live band warm","jazz lounge intimate"]),
    ("blues",     ["blues guitar live","blues bar stage","electric guitar live"]),
    ("piano",     ["piano live music","grand piano stage","pianist performing"]),
    ("karaoke",   ["karaoke microphone night","karaoke bar singing","microphone stage neon"]),
    ("open mic",  ["open mic microphone","acoustic performer stage","singer microphone intimate"]),
    ("comedy",    ["comedy club microphone","standup comedy stage","comedy spotlight mic"]),
    ("trivia",    ["pub trivia night","bar games friends","pub quiz"]),
    ("drag",      ["drag performance stage","cabaret performer lights","drag show colorful"]),
    ("cabaret",   ["cabaret stage performer","burlesque cabaret lights","variety show stage"]),
    ("country",   ["country music guitar","acoustic country band","country live show"]),
    ("emo",       ["rock concert crowd","punk band live","rock band stage"]),
    ("punk",      ["punk rock live show","loud rock concert","punk band stage"]),
    ("rock",      ["rock band live stage","rock concert crowd","electric guitar concert"]),
    ("techno",    ["techno club dark","techno dj fog lights","underground rave"]),
    ("house",     ["house music dj","dj decks club","electronic dj set"]),
    ("rave",      ["rave neon crowd","laser rave club","edm festival crowd"]),
    ("edm",       ["edm festival lights","dj edm crowd","electronic music crowd"]),
    ("banda",     ["latin party crowd","reggaeton club night","latin music dance"]),
    ("reggaeton", ["reggaeton club night","latin party dance","latin nightclub"]),
    ("afrobeat",  ["afrobeats party crowd","afro dance party","vibrant club dance"]),
    ("soca",      ["caribbean carnival party","soca dance crowd","caribana celebration"]),
    ("caribbean", ["caribbean party crowd","carnival celebration","tropical party night"]),
    ("pride",     ["pride party celebration","lgbtq pride colorful","rainbow party crowd"]),
    ("throwback", ["retro party disco","2000s party crowd","disco ball party"]),
    ("matinee",   ["acoustic afternoon set","intimate live music","singer guitar daytime"]),
    ("dj",        ["dj decks nightclub","dj performing crowd","dj booth lights"]),
    ("live",      ["live band stage","concert crowd live","live music venue"]),
]
TYPE_THEMES = {
    "Nightclub":["nightclub crowd","dj nightclub","neon club dancefloor"],
    "Live Music":["live band stage","small concert venue","indie concert crowd"],
    "Brewery":["craft beer brewery","taproom interior","beer flight bar"],
    "Cocktail Bar":["cocktail bar moody","bartender cocktail","speakeasy interior"],
    "Bar":["bar interior night","pub drinks friends","lounge bar warm"],
    "Sports":["stadium crowd","sports arena lights"],
    "Theatre":["theatre stage curtain","performing arts hall"],
    "Entertainment":["event venue lights","party crowd celebration"],
    "Outdoor":["outdoor festival","outdoor concert crowd"],
    "Culture":["art gallery interior","cultural event hall"],
}
FALLBACK = ["toronto nightlife","city night bar","party crowd"]
sb = create_client(SUPABASE_URL, SERVICE_KEY)
_cache = {}

def search(q):
    r = requests.get("https://api.unsplash.com/search/photos",
        params={"query":q,"per_page":6,"orientation":"landscape","content_filter":"high"},
        headers={"Authorization":f"Client-ID {UNSPLASH_KEY}"},timeout=20)
    r.raise_for_status(); return r.json().get("results",[])

def get_pool(key, queries):
    if key in _cache: return _cache[key]
    photos, seen = [], set()
    for q in queries:
        for p in search(q):
            if p["id"] in seen: continue
            seen.add(p["id"]); photos.append(p)
            if len(photos)>=POOL_SIZE: break
        if len(photos)>=POOL_SIZE: break
        time.sleep(0.3)
    urls=[]; slug=key.replace(" ","-")
    for i,p in enumerate(photos):
        path=f"events/{slug}/{slug}-{i}-{p['id']}.jpg"
        if DRY_RUN: urls.append(f"[{key}] {p['urls']['regular'][:55]}"); continue
        try: requests.get(p["links"]["download_location"],headers={"Authorization":f"Client-ID {UNSPLASH_KEY}"},timeout=10)
        except Exception: pass
        img=requests.get(p["urls"]["regular"],timeout=30).content
        try: sb.storage.from_(BUCKET).upload(path,img,{"content-type":"image/jpeg","upsert":"true"})
        except Exception as e:
            if "Duplicate" not in str(e): print(f"   [warn] {path}: {e}")
        urls.append(sb.storage.from_(BUCKET).get_public_url(path))
    _cache[key]=urls; return urls

def theme_for(title, vt):
    t=(title or "").lower()
    for kw,q in TITLE_THEMES:
        if kw in t: return kw,q
    if vt in TYPE_THEMES: return vt,TYPE_THEMES[vt]
    return "fallback",FALLBACK

def main():
    print(f"events re-match — DRY_RUN={DRY_RUN}")
    events=sb.table("venue_events").select("id,title,poster_url,venue_id,source").execute().data
    venues={v["id"]:v for v in sb.table("venues").select("id,venue_type").execute().data}
    todo=[e for e in events if e.get("source")=="user" and e.get("venue_id")]
    print(f"{len(todo)} user events to re-match by title.")
    buckets={}
    for e in todo:
        vt=(venues.get(e["venue_id"]) or {}).get("venue_type")
        key,q=theme_for(e["title"],vt)
        buckets.setdefault(key,{"q":q,"events":[]}); buckets[key]["events"].append(e)
    print("themes: "+", ".join(f"{k}({len(v['events'])})" for k,v in buckets.items()))
    for key,data in buckets.items():
        urls=get_pool(key,data["q"])
        if not urls: print(f"   [skip] {key}"); continue
        last=None
        for e in data["events"]:
            choices=[u for u in urls if u!=last] or urls
            url=random.choice(choices); last=url
            if DRY_RUN: print(f"   [{key}] {e['title'][:38]} -> {url}")
            else: sb.table("venue_events").update({"poster_url":url}).eq("id",e["id"]).execute()
        if not DRY_RUN: print(f"   {key}: set {len(data['events'])}")
    print("Done.")

if __name__=="__main__": main()
