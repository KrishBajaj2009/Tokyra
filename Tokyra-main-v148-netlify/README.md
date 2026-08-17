# Tokyra website — maximum compression

This is the Netlify-ready Tokyra frontend. Its compressor is connected to:

`https://tokyra-compressor.tokyracompany.workers.dev`

## What the Compress button does

1. Sends the prompt to `POST /compress-max` with a 99% target reduction.
2. Receives a background Workflow job ID.
3. Checks the returned status URL every 10 seconds.
4. Reconnects to an unfinished job after a page refresh.
5. Displays the shortest verified result and its token, compression, fidelity,
   latency, and CFS metrics.

The Worker returns the original prompt unchanged when it cannot produce a
shorter result that passes all F100 safety checks.

## Deploy to Netlify

1. Sign in to Netlify and open the existing Tokyra site.
2. Open **Deploys**.
3. Drag this `Tokyra-main` folder into Netlify's manual deployment area.
4. Wait for the deployment to become **Published**.
5. Open `compressor.html`, paste a prompt, and select **Start maximum
   compression**.

The site is static and does not require a build command, package installation,
API key, or environment variable.

## Free-plan behavior

Cloudflare's Workers AI free allocation applies. Maximum compression may run
for up to 45 minutes, but Free-plan CPU and daily AI limits mean a job cannot
be guaranteed to use every configured round. When the daily free allocation is
exhausted, Cloudflare stops further AI work instead of charging the account.

## Future changes

- Website changes: edit the files in this folder and redeploy the folder to
  Netlify.
- Compressor backend changes: edit the separate v148 Worker project and run
  `npx.cmd wrangler deploy` from that Worker project.
- Do not use Cloudflare's dashboard editor as the source copy of the Worker;
  Wrangler's local project is the source of truth.
