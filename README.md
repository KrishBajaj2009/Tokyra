# Tokyra website — fast Cloudflare Free compression

This is the Netlify-ready Tokyra frontend. Its compressor is connected to:

`https://tokyra-compressor.tokyracompany.workers.dev`

## What the Compress button does

1. Sends one request to the main compression endpoint.
2. Uses `balanced` mode with a 66% target reduction so the Worker can stop
   after its first high-quality result.
3. Displays the optimized prompt and its token, compression, fidelity,
   latency, and CFS metrics immediately after the request finishes.

The Worker returns the original prompt unchanged when it cannot produce a
shorter result that passes its safety checks.

## Deploy to Netlify

1. Sign in to Netlify and open the existing Tokyra site.
2. Open **Deploys**.
3. Drag this `Tokyra-main` folder into Netlify's manual deployment area.
4. Wait for the deployment to become **Published**.
5. Open `compressor.html`, paste a prompt, and select **Compress prompt**.

The site is static and does not require a build command, package installation,
API key, or environment variable.

## Free-plan behavior

Cloudflare's Workers AI free allocation applies. This site deliberately avoids
the 45-minute Workflow because Cloudflare Free limits each Workflow step to 10
ms of active CPU time. When the daily free AI allocation is exhausted,
Cloudflare stops further AI work instead of charging the account.

## Future changes

- Website changes: edit the files in this folder and redeploy the folder to
  Netlify.
- Compressor backend changes: edit the separate v148 Worker project and run
  `npx.cmd wrangler deploy` from that Worker project.
- Do not use Cloudflare's dashboard editor as the source copy of the Worker;
  Wrangler's local project is the source of truth.
