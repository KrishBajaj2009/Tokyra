# Tokyra — Prompt Compressor (Wasmer Edge)

Wasmer doesn't support one combined frontend+backend app the way Vercel
does. It needs **two separate apps**:

- **`tokyra-frontend/`** — the static React site (what people visit)
- **`tokyra-api/`** — a JS Service Worker that holds your Anthropic API
  key and does the actual compression call

They deploy independently and talk to each other over HTTPS.

⚠️ **Being upfront**: I built this from Wasmer's official docs and the
real config files in their own example repos (not guesses), but I
couldn't actually deploy it myself to verify — my sandbox can't reach
wasmer.io. Test locally with `wasmer run .` (steps below) before
deploying live, exactly as Wasmer's own guides recommend.

## Prerequisites

- Node.js installed (for building the frontend)
- Wasmer CLI: install from https://docs.wasmer.io/install
- A Wasmer account: `wasmer login` (free, no card)
- An Anthropic API key: https://console.anthropic.com/settings/keys

## Step 1: Deploy the backend (`tokyra-api`) first

You need its URL before the frontend can call it.

```bash
cd tokyra-api
```

Edit **both** `wasmer.toml` and `app.yaml` — replace
`YOUR_WASMER_USERNAME` with your actual Wasmer username in both files.

Test it locally first:

```bash
wasmer run . --net
```

(The `--net` flag grants local network access so the worker can reach
`api.anthropic.com` — this is only needed for local testing; deployed
Edge apps have network access by default.)

In another terminal:

```bash
curl http://127.0.0.1:8080/health
# should return {"ok":true}
```

If that works, add your secrets (these are encrypted, never committed to
git):

```bash
wasmer app secrets create ANTHROPIC_API_KEY "sk-ant-your-real-key"
wasmer app secrets create ACCESS_PASSWORD "choose-a-password"
```

Then deploy:

```bash
wasmer deploy
```

Wasmer will print a URL like `https://tokyra-api-yourusername.wasmer.app`
— **copy this down**, you need it in step 2.

Sanity check once it's live:

```bash
curl https://tokyra-api-yourusername.wasmer.app/health
```

## Step 2: Point the frontend at the backend

```bash
cd ../tokyra-frontend
```

Open `src/App.jsx` and replace the `API_URL` constant near the top with
the real URL from step 1:

```js
const API_URL = "https://tokyra-api-yourusername.wasmer.app";
```

Rebuild:

```bash
npm install
npm run build
```

Edit `wasmer.toml` and `app.yaml` here too — same
`YOUR_WASMER_USERNAME` replacement, and set `name` to `tokyra` (or
whatever you want the site's URL to be).

Test locally:

```bash
wasmer run . -- --port 9000
# open http://localhost:9000
```

Deploy:

```bash
wasmer deploy
```

## If you're using GitHub auto-deploy instead of the CLI

Push both folders as-is (including the pre-built `tokyra-frontend/dist/`
folder — don't gitignore it) to your repo, then reconnect each as a
separate app in the Wasmer dashboard, pointing at the respective
subfolder. Committing `dist/` matters here: Wasmer's git integration may
not run `npm run build` for a plain Vite project the way it does for
Next.js/Astro, so shipping the already-built output avoids relying on
that.

## Protecting against cost overruns

The Anthropic API is metered — anyone hitting `/compress` spends your
money. Already wired in:

- **Password gate** via the `ACCESS_PASSWORD` secret + the frontend's
  password field
- **Basic rate limiting** (~20 requests/15 min per IP) — best-effort,
  resets on instance restart

Also set a monthly spend cap on your Anthropic key at
https://console.anthropic.com/settings/limits as a hard backstop.

## Making changes later

- **Backend logic**: edit `tokyra-api/app/app.js`, then `wasmer deploy`
  from inside `tokyra-api/`.
- **Frontend**: edit files in `tokyra-frontend/src/`, run
  `npm run build`, then `wasmer deploy` from inside `tokyra-frontend/`.
