# Prompt Compressor

A tool that sends your text to Claude and rewrites it to use fewer tokens
while preserving meaning — with a token-count comparison. Built as a
single project: a React frontend (Vite) + one serverless function
(`api/compress.js`) that holds your API key securely.

## Free hosting: Vercel (recommended)

Vercel's free "Hobby" tier hosts both the static site and the serverless
function together, with no credit card required, and no time limit. This
is the easiest path.

### 1. Get an Anthropic API key

https://console.anthropic.com/settings/keys — requires billing set up on
that account (API usage is metered; see "About costs" below).

### 2. Put this code in a GitHub repo

If you don't already have one:

```bash
cd prompt-compressor-web
git init
git add .
git commit -m "Initial commit"
```

Create a new empty repo on https://github.com/new, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 3. Deploy on Vercel

1. Go to https://vercel.com and sign up (free, GitHub login works, no
   card needed).
2. Click **Add New → Project**, select your repo. Vercel auto-detects
   Vite — leave the default build settings.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` — your key from step 1
   - `ACCESS_PASSWORD` — any password you choose (recommended — see below)
4. Click **Deploy**. In about a minute you'll get a live URL like
   `https://your-project.vercel.app`.

That's it — frontend and backend are both live on that one URL. Every
push to your `main` branch auto-redeploys.

### Local testing before you deploy (optional)

```bash
npm install -g vercel   # one-time
npm install
vercel dev
```

`vercel dev` runs the frontend *and* the `/api` functions together
locally, reading from a `.env` file (copy `.env.example` to `.env` and
fill in your key first). Plain `vite dev` alone won't run the API
functions — use `vercel dev` for that.

## Protecting the app before you share the link

Anthropic's API is metered — anyone who can reach `/api/compress` spends
your money. Two things are already wired in:

- **Password gate**: with `ACCESS_PASSWORD` set, every request needs that
  value in an `X-App-Password` header (the frontend has a password field
  for this). Leave it unset only for private local testing.
- **Basic rate limiting**: caps each IP to ~20 requests per 15 minutes.
  This is best-effort — it resets whenever Vercel spins up a fresh
  instance of the function, so it slows down abuse rather than hard-
  blocking it. Fine while you're testing with friends; not sufficient
  once you have real public traffic.

Also do this on Anthropic's console: set a monthly spend cap on your key
at https://console.anthropic.com/settings/limits, so a worst case has a
hard ceiling no matter what.

### If this grows into something with real traffic

Swap the in-memory rate limiter for **Upstash Redis** — it has a free
tier, integrates natively with Vercel, and gives you real limits that
persist across every function instance instead of resetting on cold
starts. Worth doing before a public launch, not necessary for an early
demo or pitch.

## About costs — there's no free-forever API tier

Hosting (Vercel) is free. The Anthropic API itself is not — every
compression request costs a small amount based on tokens processed.
There's no way around this for any LLM provider; compute costs money.
Realistic ways to manage it as this grows:

- Keep the password gate and spend cap on while you're validating the
  idea, so cost stays near zero until real usage exists.
- If you eventually want a free tier for users, budget for it explicitly
  (e.g. a small number of compressions/month per account) rather than
  leaving the API open.
- Cheaper open-weight models (via Groq's free tier, or self-hosted) are
  an option for a "lite" free tier later, at a quality trade-off — not
  something to build now if you're still validating the concept.

## Alternative: Cloudflare Pages

Also fully free with no card required, and pairs well if you'd rather
use Cloudflare Workers/KV for rate limiting later. The setup differs
slightly (Cloudflare Pages Functions instead of Vercel's `/api` folder,
environment variables set as "Secrets" in the Pages dashboard). Ask if
you want this version instead — the React frontend is unchanged either
way, just the function syntax and deploy steps differ.

## Notes

- Token counts shown are estimates (characters ÷ 4). The function also
  returns the real `usage` object from the Anthropic API for the
  compression call itself, in the response, if you want exact numbers.
- Input is capped at 50,000 characters server-side.
- Compression is a rewrite, not lossless — for anything high-stakes,
  check that the compressed prompt still gets the answer you want.
