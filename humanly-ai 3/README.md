# Humanly AI

Humanly is a standalone writing workspace with two tools:

- **Rewrite** edits stiff or generic text into a more natural voice while preserving facts, names, numbers, dates, quotes, links, and technical terms.
- **Analyze** estimates whether a passage contains AI-like writing patterns and shows which signals affected the score.

It is intentionally separate from every other project in the parent workspace.

## Run it

Humanly requires Node.js 20 or newer and has no package dependencies.

```bash
cd humanly-ai
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

Without an API key, the app runs in **local demo mode**. Rewriting uses a conservative deterministic editor, and analysis uses transparent stylistic heuristics.

## Connect a model

Set environment variables in your shell or load them using your preferred secret manager:

```bash
export OPENAI_API_KEY="your-key"
export HUMANLY_MODEL="gpt-4.1-mini"
npm start
```

Any service that implements the OpenAI-compatible `/chat/completions` endpoint can be used:

```bash
export OPENAI_BASE_URL="https://your-provider.example/v1"
export OPENAI_API_KEY="your-key"
export HUMANLY_MODEL="your-model-name"
```

The API key is read only by `server.js`; it is never sent to or stored by the browser.

## Test

```bash
npm test
```

## Deploy on Netlify

The repository includes `netlify.toml`, which tells Netlify to publish the `public` directory and deploy the API from `netlify/functions`.

1. Put the complete project in a GitHub repository. Keep `netlify.toml` at the repository root.
2. In Netlify, select **Add new project → Import an existing project** and choose the repository.
3. Netlify will read the included settings. The publish directory should show `public`; no build command is required.
4. Deploy the site.
5. For model-powered rewriting, add `OPENAI_API_KEY` under **Project configuration → Environment variables**, then redeploy. You can optionally add `HUMANLY_MODEL` and `OPENAI_BASE_URL`.

Do not upload only `public/index.html`. The full repository is required for Rewrite and Analyze API routes to work on Netlify.

## API

### `POST /api/humanize`

```json
{
  "text": "Text to edit",
  "voice": "natural",
  "strength": "balanced",
  "audience": "my team"
}
```

Voice can be `natural`, `warm`, `professional`, `casual`, or `concise`. Strength can be `light`, `balanced`, or `bold`.

### `POST /api/detect`

```json
{
  "text": "Text to inspect"
}
```

The response includes a 0–100 AI-pattern score, a cautious verdict, evidence confidence, individual metrics, and human/AI-leaning signals.

## Important limitation

No text-only detector can reliably determine whether every passage came from Claude, GPT, Gemini, another model, or a human. Editing, translation, short samples, formal genres, and non-native writing make attribution even less reliable. Humanly therefore:

- does not claim to identify a specific model family;
- labels short or ambiguous samples with low confidence;
- explains the patterns behind its estimate; and
- should never be the sole basis for grading, hiring, discipline, moderation, or accusations.
