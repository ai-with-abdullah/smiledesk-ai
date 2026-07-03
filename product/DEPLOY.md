# Turn the Product ON — 15-Minute Deploy Guide ($0)

The product code is 100% complete. It stays OFF until you connect these three free
accounts — only you can create them (they need your login/verification).

**Total cost: $0.** Cloudflare Workers free tier = 100,000 requests/day.
Gemini free tier = plenty for dozens of trial customers. You pay nothing until you
outgrow free tiers — which only happens when you already have paying customers.

---

## Step 1 — Get a free Gemini API key (2 min)

1. Go to https://aistudio.google.com/apikey (sign in with your Google account).
2. Click **Create API key** → copy it. That's the AI brain, free.

## Step 2 — Deploy the backend to Cloudflare (8 min)

1. Sign up free at https://dash.cloudflare.com/sign-up (no card needed).
2. In Terminal:

```bash
cd "/Users/macintosh/Desktop/untitled folder/smiledesk-ai/product"
npm install -g wrangler          # Cloudflare's CLI
wrangler login                   # opens browser, approve once

# Create the free key-value database
wrangler kv namespace create ASSISTANTS
# ^ this prints an id like: id = "abc123..." — paste it into wrangler.toml (see below)

# Set your secrets
wrangler secret put GEMINI_API_KEY   # paste the key from Step 1
wrangler secret put ADMIN_TOKEN      # type any long random password, SAVE IT somewhere

# Deploy
wrangler deploy
```

3. Create `wrangler.toml` in this folder first (template already provided —
   just replace the KV id):

```toml
name = "smiledesk"
main = "worker.js"
compatibility_date = "2026-07-01"

[[kv_namespaces]]
binding = "ASSISTANTS"
id = "PASTE_THE_ID_FROM_STEP_2_HERE"
```

4. `wrangler deploy` prints your live URL, e.g. `https://smiledesk.abdullah.workers.dev`
   — **that's your product backend, live.**

## Step 3 — Connect the website to the backend (2 min)

1. Open `app.html`, find the CONFIGURATION block near the bottom:
   - `WORKER_URL = ""` → paste your workers.dev URL from Step 2.
2. Commit & push:

```bash
cd "/Users/macintosh/Desktop/untitled folder/smiledesk-ai"
git add -A && git commit -m "Connect backend" && git push
```

Done. Now anyone on Earth can visit your app page, create their own AI
receptionist, and start a 14-day trial — with zero involvement from you.

## Step 4 — Get paid automatically (5 min, do this the same day)

1. Sign up at https://stripe.com (free; Pakistan note: if Stripe isn't available in
   your country, use https://lemonsqueezy.com or https://paddle.com — both free,
   both support PK sellers, they only take a % per sale).
2. Create a **Payment Link**: Product "SmileDesk AI — Monthly", $29/month recurring.
3. Paste the link into `app.html` → `PAYMENT_URL = "https://buy.stripe.com/..."`,
   commit & push.
4. When someone pays, the receipt email shows their Assistant ID. Activate them
   (10 seconds):

```bash
curl -X POST https://smiledesk.YOURNAME.workers.dev/api/activate \
  -H "Content-Type: application/json" \
  -d '{"id":"THEIR_ASSISTANT_ID","admin_token":"YOUR_ADMIN_TOKEN","paid":true}'
```

(Later, when revenue justifies it, we automate this with a Stripe webhook — v2.)

---

## Pricing logic (why $29/mo self-serve vs $249/mo done-for-you)

- **Self-serve chat widget ($29/mo):** customer does everything alone → low price,
  high volume, worldwide market. This is your "Linktree model" product.
- **Done-for-you phone AI ($249/mo):** you install, tune, and monitor → premium.
  Sell this to the clinics the client-hunter agent finds.

Two products, one brand, one website. Self-serve builds volume + the free-trial
viral loop; done-for-you builds cash now.
