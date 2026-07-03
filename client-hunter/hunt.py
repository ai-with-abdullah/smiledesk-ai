#!/usr/bin/env python3
"""
SmileDesk AI — Client Hunter Agent
Finds dental/medical clinics in any city worldwide (free OpenStreetMap data),
extracts contact emails from their websites, and writes a personalized outreach
draft for each lead.

Usage:
    python3 hunt.py "London, UK" "Dubai, UAE" "Sydney, Australia"
    python3 hunt.py --type clinic "Toronto, Canada"          # medical clinics
    python3 hunt.py --max 40 "New York, USA"

Output (in this folder):
    leads.csv        — Name | City | Website | Email | Phone | Status
    drafts/*.txt     — one ready-to-send personalized email per lead

Zero cost, zero API keys required. Optional: set GEMINI_API_KEY env var for an
AI-personalized opening line per clinic (free key: aistudio.google.com/apikey).

IMPORTANT — send responsibly:
  * YOU review and send each email personally from your own Gmail (max ~20-25/day).
  * Every draft includes an honest sender identity and an opt-out line
    (required by anti-spam laws like CAN-SPAM/GDPR/PECR).
"""

import csv
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "SmileDeskAI-LeadResearch/1.0 (contact: abdullah.tech.ai@gmail.com)"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE  # some clinic sites have broken certs; read-only fetch

SITE_LINK = "https://ai-with-abdullah.github.io/smiledesk-ai/"

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
SKIP_EMAIL = re.compile(r"(example\.|sentry|wixpress|\.png|\.jpg|\.gif|godaddy|domain)", re.I)

OSM_TAGS = {"dentist": '["amenity"="dentist"]', "clinic": '["amenity"="clinic"]'}

OVERPASS_MIRRORS = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def http_get(url, timeout=20, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read().decode("utf-8", errors="ignore")


def http_post(url, data, timeout=60):
    req = urllib.request.Request(
        url, data=data.encode(), headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"}
    )
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read().decode("utf-8", errors="ignore")


def geocode(city):
    """City name -> bounding box via free Nominatim."""
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": city, "format": "json", "limit": 1}
    )
    data = json.loads(http_get(url))
    if not data:
        return None
    bb = data[0]["boundingbox"]  # [south, north, west, east]
    return f"{bb[0]},{bb[2]},{bb[1]},{bb[3]}"


def find_clinics(city, kind, limit):
    """Query free Overpass API for clinics with contact info in the city."""
    bbox = geocode(city)
    if not bbox:
        print(f"  !! could not locate '{city}', skipping")
        return []
    time.sleep(1)  # be polite to Nominatim
    tag = OSM_TAGS[kind]
    query = f"""
[out:json][timeout:60];
(node{tag}({bbox}); way{tag}({bbox}););
out center {limit * 4};
"""
    elements = None
    for mirror in OVERPASS_MIRRORS:
        try:
            raw = http_post(mirror, "data=" + urllib.parse.quote(query))
            elements = json.loads(raw).get("elements", [])
            break
        except Exception as e:
            print(f"   .. {mirror.split('/')[2]} busy ({type(e).__name__}), trying next mirror")
            time.sleep(2)
    if elements is None:
        print("  !! all Overpass mirrors busy right now — try again in a few minutes")
        return []
    leads = []
    for el in elements:
        t = el.get("tags", {})
        name = t.get("name")
        if not name:
            continue
        website = t.get("website") or t.get("contact:website") or ""
        email = t.get("email") or t.get("contact:email") or ""
        phone = t.get("phone") or t.get("contact:phone") or ""
        # prioritize leads where we can actually reach someone
        if website or email:
            leads.append({"name": name, "city": city, "website": website, "email": email, "phone": phone})
        if len(leads) >= limit:
            break
    return leads


def extract_email(website):
    """Fetch homepage + /contact and pull the first plausible email."""
    if not website.startswith("http"):
        website = "https://" + website
    for path in ("", "/contact", "/contact-us"):
        try:
            html = http_get(website.rstrip("/") + path, timeout=15)
        except Exception:
            continue
        for m in EMAIL_RE.findall(html):
            if not SKIP_EMAIL.search(m):
                return m.lower()
        time.sleep(0.5)
    return ""


def gemini_opener(lead):
    """Optional: one personalized opening line via free Gemini API."""
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return ""
    prompt = (
        f"Write ONE short, warm, specific opening line (max 25 words) for a cold email to "
        f'"{lead["name"]}", a dental clinic in {lead["city"]}. Mention the city naturally. '
        f"No greetings, no quotes, just the line."
    )
    try:
        body = json.dumps({"contents": [{"parts": [{"text": prompt}]}]})
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}",
            data=body.encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            data = json.loads(r.read())
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return ""


def draft_email(lead):
    opener = gemini_opener(lead) or (
        f"I was researching well-reviewed dental clinics in {lead['city']} and {lead['name']} came up."
    )
    return f"""Subject: Missed patient calls at {lead['name']}?

Hi {lead['name']} team,

{opener}

Quick question: what happens to calls your front desk can't answer — lunch, evenings, weekends? Studies show ~1 in 3 calls to dental clinics go unanswered, and most of those patients book with whoever picks up next.

I run SmileDesk AI. We give clinics a 24/7 AI receptionist that answers every call/chat, books appointments into your calendar, and flags emergencies to staff.

I'd like to set it up for {lead['name']} completely FREE for 14 days — no card, we do all the work. After 2 weeks you get a report: calls answered, appointments booked. If the numbers don't impress you, you pay nothing.

1-minute demo: {SITE_LINK}

Worth a quick reply? Even a "no thanks" is fine and I won't follow up further.

Best regards,
M. Abdullah
SmileDesk AI — abdullah.tech.ai@gmail.com
(If you'd rather not hear from me, just reply "remove" and I'll delete your details.)
"""


def main():
    args = [a for a in sys.argv[1:]]
    kind, limit = "dentist", 25
    cities = []
    i = 0
    while i < len(args):
        if args[i] == "--type":
            kind = args[i + 1]; i += 2
        elif args[i] == "--max":
            limit = int(args[i + 1]); i += 2
        else:
            cities.append(args[i]); i += 1
    if not cities:
        print(__doc__)
        sys.exit(1)
    if kind not in OSM_TAGS:
        print(f"--type must be one of: {', '.join(OSM_TAGS)}")
        sys.exit(1)

    os.makedirs(os.path.join(HERE, "drafts"), exist_ok=True)
    csv_path = os.path.join(HERE, "leads.csv")
    all_leads = []

    for city in cities:
        print(f"\n🔎 Hunting {kind}s in {city} …")
        leads = find_clinics(city, kind, limit)
        print(f"   found {len(leads)} clinics with contact info")

        for n, lead in enumerate(leads, 1):
            if not lead["email"] and lead["website"]:
                print(f"   [{n}/{len(leads)}] extracting email from {lead['website'][:60]} …")
                lead["email"] = extract_email(lead["website"])
                time.sleep(1)  # polite crawling
            lead["status"] = "ready" if lead["email"] else "no-email (use website contact form)"
            slug = re.sub(r"[^a-z0-9]+", "-", lead["name"].lower())[:40].strip("-")
            with open(os.path.join(HERE, "drafts", f"{slug}.txt"), "w") as f:
                f.write(draft_email(lead))
            all_leads.append(lead)

    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["name", "city", "website", "email", "phone", "status"])
        w.writeheader()
        w.writerows(all_leads)

    ready = sum(1 for l in all_leads if l["email"])
    print(f"\n✅ Done. {len(all_leads)} leads saved to leads.csv ({ready} with direct emails).")
    print(f"   Personalized drafts in: {os.path.join(HERE, 'drafts')}/")
    print("   → Review each draft, personalize if needed, send max 20-25/day from your Gmail.")


if __name__ == "__main__":
    main()
