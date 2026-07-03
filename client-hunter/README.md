# Client Hunter Agent 🎯

Finds clinics in any city in the world, extracts their contact emails from their
own websites, and writes a personalized outreach draft for every lead.
Free data (OpenStreetMap), zero API keys required.

## Daily routine (20 minutes → 20 international leads)

```bash
cd "/Users/macintosh/Desktop/untitled folder/smiledesk-ai/client-hunter"

# Pick 1-2 new cities each day. Best markets: UK, US, Canada, Australia, UAE, Ireland.
python3 hunt.py --max 20 "Birmingham, UK"
python3 hunt.py --max 20 "Dubai, UAE" "Austin, USA"

# medical clinics instead of dentists:
python3 hunt.py --type clinic --max 20 "Toronto, Canada"
```

Then:
1. Open `leads.csv` — every lead marked **ready** has a direct email.
2. Open `drafts/<clinic-name>.txt` — review, tweak one line, copy into Gmail, send.
3. **Max 20–25 sends/day** from one Gmail account or Google will flag you.
4. Log sends in your tracking sheet; follow up after 2 days (templates in
   `../marketing/outreach-scripts.md`).

## Optional: AI-personalized opening lines

```bash
export GEMINI_API_KEY="your-free-key"   # from aistudio.google.com/apikey
python3 hunt.py --max 20 "London, UK"
```

Each draft then opens with a unique line written for that specific clinic.

## Rules (important)

- **You** send every email personally after reviewing it — this agent prepares, it
  never sends. That keeps you legal (CAN-SPAM/GDPR), keeps your Gmail alive, and
  honestly converts better.
- Every draft already includes your real identity and a remove-me line. Keep them.
- If a clinic replies "remove", delete them from your sheet immediately.
- `leads.csv` and `drafts/` are git-ignored — never publish scraped contact data.
