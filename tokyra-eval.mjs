import fs from "node:fs";
import vm from "node:vm";
import { TextEncoder } from "node:util";
import crypto from "node:crypto";

function loadTokyraModule() {
  const sourcePath =
    new URL("./tokyra-worker.js", import.meta.url);

  let source =
    fs.readFileSync(
      sourcePath,
      "utf8"
    );

  source =
    source.replace(
      /export default\s*\{/,
      "globalThis.__worker_default = {"
    ) +
    "\n\nglobalThis.__tokyra = { optimizePrompt, deterministicCompact, protectExactSpans, validateCandidate, extractCriticalLiterals, extractSoftLiterals };\n";

  const sandbox = {
    console,
    TextEncoder,
    crypto:
      crypto.webcrypto,
    URL,
    Response,
    Request,
    setTimeout,
    clearTimeout
  };

  sandbox.globalThis =
    sandbox;

  vm.createContext(sandbox);
  new vm.Script(
    source,
    {
      filename:
        "tokyra-worker.js"
    }
  ).runInContext(sandbox);

  return sandbox.__tokyra;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const {
  optimizePrompt
} = loadTokyraModule();

const cases = [
  {
    name:
      "redundant-support-prompt",
    mode:
      "balanced",
    input: `
You are a senior support engineer for a developer tools platform. Answer clearly and concisely, but do not omit implementation details, API field names, edge cases, or operational caveats.

Please make sure the answer is organized and readable. Please make sure the answer is organized and readable. Please make sure the answer is organized and readable.

If the user is troubleshooting 429 errors, mention rate limits. If the user is troubleshooting 429 errors, mention rate limits. If the user is troubleshooting 429 errors, mention rate limits.

If the user is troubleshooting authentication, tell them to check the "Authorization" header and the format "Bearer <token>" exactly. If the user is troubleshooting authentication, tell them to check the "Authorization" header and the format "Bearer <token>" exactly.

Required endpoints:
- GET /v1/projects
- POST /v1/projects
- POST /v1/chat/completions

Output requirements:
- Use short sections
- Use bullets for steps
- Do not invent endpoints
- Prefer TypeScript unless Python is requested
    `,
    aiOutput: `
<TOKYRA_OUTPUT>
ROLE: senior developer-tools support engineer
GOAL: answer clearly and concisely without omitting implementation details, API field names, edge cases, or operational caveats
AUTH: preserve "Authorization" and "Bearer <token>" exactly for auth issues
KEEP: GET /v1/projects; POST /v1/projects; POST /v1/chat/completions
WHEN 429: mention rate limits
FORMAT: short sections, bullets for steps, no invented endpoints, prefer TypeScript unless Python requested
</TOKYRA_OUTPUT>
    `
  },
  {
    name:
      "schema-plus-code-fence",
    mode:
      "balanced",
    input: `
You are an API assistant. Preserve JSON field names exactly. Preserve code fences verbatim if reused. Be concise, but do not remove required behavior.

If the user asks about project creation, preserve these exact JSON keys:
{
  "name": "string",
  "environment": "dev | staging | prod",
  "region": "us-east-1 | eu-west-1",
  "retention_days": 30
}

If the user asks about completions, preserve these exact fields:
{
  "model": "alpha-2",
  "input": "string",
  "max_output_tokens": 800
}

Keep this example verbatim if reused:

\`\`\`ts
fetch("/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <token>"
  }
});
\`\`\`

Do not invent fields. Do not invent fields. Do not invent fields.
    `,
    aiRun(
      _model,
      payload
    ) {
      const userContent =
        payload.messages[1]
          .content;

      const markersMatch =
        userContent.match(
          /Protected markers: (\[[^\n]+\])/
        );

      const markers =
        markersMatch
          ? JSON.parse(
              markersMatch[1]
            )
          : [];

      return `
<TOKYRA_OUTPUT>
ROLE: API assistant
GOAL: be concise without removing required behavior
KEEP EXACT: "retention_days", "max_output_tokens", "alpha-2", "/v1/chat/completions", "Authorization", "Bearer <token>"
RULES: preserve reused code fences verbatim; do not invent fields; keep JSON keys "name", "environment", "region", "model", "input"

${markers[0] || ""}
</TOKYRA_OUTPUT>
      `;
    }
  },
  {
    name:
      "code-heavy-system-prompt",
    mode:
      "maximum",
    input: `
You are a TypeScript coding assistant. Preserve behavior, signatures, dependencies, and output format. Never silently change runtime behavior.

If code is provided, preserve it unless the request is explicitly to refactor it. If code is provided, preserve it unless the request is explicitly to refactor it.

Important:
- keep function names
- keep parameters
- keep return types
- keep error handling
- keep edge cases
- keep examples that define behavior
- keep package names

Do not answer with prose only if the user asked for code. Prefer minimal diffs where practical. Prefer minimal diffs where practical.
    `,
    aiOutput: `
<TOKYRA_OUTPUT>
ROLE: TypeScript coding assistant
KEEP: behavior, signatures, dependencies, output format, function names, parameters, return types, error handling, edge cases, behavioral examples, package names
DONT: silently change runtime behavior
RULES: preserve provided code unless refactor requested; if user asked for code, do not answer with prose only; prefer minimal diffs where practical
</TOKYRA_OUTPUT>
    `
  },
  {
    name:
      "ai-failure-deterministic-fallback",
    mode:
      "balanced",
    input: `
Please make sure the answer is organized and readable.

Please make sure the answer is organized and readable.

Please make sure the answer is organized and readable.

In order to help the user, please be concise.
    `,
    aiThrows:
      "mock model unavailable"
  }
];

for (const testCase of cases) {
  section(testCase.name);

  const env = {
    AI_MODEL:
      "mock-model",
    AI:
      testCase.aiThrows
        ? {
            async run() {
              throw new Error(
                testCase.aiThrows
              );
            }
          }
        : testCase.aiRun
          ? {
              async run(
                model,
                payload
              ) {
                return testCase.aiRun(
                  model,
                  payload
                );
              }
            }
        : {
            async run() {
              return testCase.aiOutput;
            }
          }
  };

  const result =
    await optimizePrompt(
      env,
      testCase.input,
      {
        mode:
          testCase.mode
      }
    );

  console.log(
    JSON.stringify(
      {
        method:
          result.method,
        accepted:
          result.accepted,
        status:
          result.status,
        compressionPercent:
          result.compressionPercent,
        originalTokens:
          result.originalTokens,
        optimizedTokens:
          result.optimizedTokens,
        targetReductionPercent:
          result.targetReductionPercent,
        validationIssues:
          result.validationIssues,
        rejectionIssues:
          result.rejectionIssues,
        retryNotes:
          result.retryNotes
      },
      null,
      2
    )
  );
}
