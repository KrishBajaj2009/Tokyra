# Tokyra website

Tokyra is a static, Netlify-ready frontend for prompt compression. The live compressor connects to:

`https://tokyra-compressor.tokyracompany.workers.dev`

## Pages

- `index.html` — product landing page and animated compression preview
- `compressor.html` — live prompt compressor
- `demos.html` — three preloaded, zero-API demonstrations
- `metrics.html` — live aggregate and latest-run metrics

Shared presentation and interaction code lives in `style.css`, `site.js`, and `auth.js`. Page-specific behavior lives in `compressor.js`, `demos.js`, and `metrics.js`.

## Compressor behavior

The compressor sends one request in `balanced` mode with a 66% target reduction. It supports paste, voice input when the browser provides speech recognition, and text-like file uploads up to 500,000 characters.

The UI displays original tokens, optimized tokens, tokens saved, compression, fidelity, latency, and CFS. The Worker remains the source of truth for compression and safety checks. It can preserve the original prompt when no shorter candidate safely retains protected instructions and literals.

## Run locally

Serve the directory with any static web server. No build command, package install, API key, or frontend environment variable is required.

## Deployment

The repository is compatible with Netlify static hosting. Changes pushed to the branch connected to the Tokyra Netlify site can deploy without a build step.

The Cloudflare Worker is maintained separately; do not place Worker secrets or AI credentials in this frontend repository.
