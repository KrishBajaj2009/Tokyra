# Tokyra website

Tokyra is a static, Netlify-ready frontend for prompt compression. The live compressor connects to:

`https://tokyra-compressor.tokyracompany.workers.dev`

## Pages

- `index.html` — product landing page and animated compression preview
- `compressor.html` — live prompt compressor
- `demos.html` — three preloaded, zero-API demonstrations
- `metrics.html` — live aggregate and latest-run metrics

Shared presentation and interaction code lives in `style.css`, `site.js`, and `auth.js`. Page-specific behavior lives in `compressor.js`, `demos.js`, and `metrics.js`.

## Signal visual theme

`experience.css` applies the dark violet theme across all four pages. The homepage pairs original chrome-core artwork with perspective-projected particle orbits, cursor parallax, and scroll reveals. `experience.js` provides the hero animation without external runtime dependencies. It caps canvas resolution, suspends rendering offscreen or in hidden tabs, honors reduced motion, and offers a persistent pause control. The illustrated homepage metrics remain labeled examples.

The existing static hosting flow remains supported. To validate local links and prepare a public-only Sites bundle, run `node .openai/build.mjs`. Its output is `dist/`; `.openai/hosting.json` identifies the separate private review deployment.

## Compressor behavior

The compressor sends one request in `balanced` mode with a 66% target reduction. It supports paste, voice input when the browser provides speech recognition, and text-like file uploads up to 500,000 characters.

The UI displays original tokens, optimized tokens, tokens saved, compression, fidelity, latency, and CFS. The Worker remains the source of truth for compression and safety checks. It can preserve the original prompt when no shorter candidate safely retains protected instructions and literals.

## Run locally

Serve the directory with any static web server. No build command, package install, API key, or frontend environment variable is required.

## Deployment

The repository is compatible with Netlify static hosting. Changes pushed to the branch connected to the Tokyra Netlify site can deploy without a build step.

The Cloudflare Worker is maintained separately; do not place Worker secrets or AI credentials in this frontend repository.
