import fs from "node:fs";
import vm from "node:vm";
import { TextEncoder } from "node:util";
import crypto from "node:crypto";

const ROOT =
  new URL("./", import.meta.url);

const RESULTS_PATH =
  new URL(
    "./tokyra-live-results.json",
    ROOT
  );

const ENV_PATH =
  new URL(
    "./cloudflare-test.env",
    ROOT
  );

const MODELS = [
  {
    name:
      null,
    label:
      "Tokyra Auto",
    maxInputTokens:
      131_072
  },
  {
    name:
      "@cf/qwen/qwen3-30b-a3b-fp8",
    label:
      "Qwen3 30B A3B",
    maxInputTokens:
      32_768
  },
  {
    name:
      "@cf/openai/gpt-oss-20b",
    label:
      "GPT OSS 20B",
    maxInputTokens:
      131_072
  },
  {
    name:
      "@cf/meta/llama-4-scout-17b-16e-instruct",
    label:
      "Llama 4 Scout 17B",
    maxInputTokens:
      131_000
  },
  {
    name:
      "@cf/meta/llama-3.2-3b-instruct",
    label:
      "Llama 3.2 3B Instruct",
    maxInputTokens:
      80_000
  }
];

const TARGET_CASES = [
  {
    name: "t100",
    targetTokens: 100,
    theme: "support"
  },
  {
    name: "t300",
    targetTokens: 300,
    theme: "api"
  },
  {
    name: "t700",
    targetTokens: 700,
    theme: "writer"
  },
  {
    name: "t1500",
    targetTokens: 1500,
    theme: "code"
  },
  {
    name: "t3000",
    targetTokens: 3000,
    theme: "ops"
  },
  {
    name: "t6000",
    targetTokens: 6000,
    theme: "policy"
  },
  {
    name: "t12000",
    targetTokens: 12000,
    theme: "agent"
  },
  {
    name: "t24000",
    targetTokens: 24000,
    theme: "mixed"
  },
  {
    name: "t50000",
    targetTokens: 50000,
    theme: "agent"
  },
  {
    name: "t100000",
    targetTokens: 100000,
    theme: "mixed"
  }
];

function selectedCases() {
  const fileArgument =
    process.argv.find(arg =>
      arg.startsWith(
        "--file="
      )
    );

  if (fileArgument) {
    const filePath =
      fileArgument
        .slice("--file=".length)
        .trim();

    if (!filePath) {
      throw new Error(
        "--file requires a path."
      );
    }

    const maxCharsArgument =
      process.argv.find(arg =>
        arg.startsWith(
          "--max-chars="
        )
      );

    const maxChars =
      maxCharsArgument
        ? Number.parseInt(
            maxCharsArgument.slice(
              "--max-chars=".length
            ),
            10
          )
        : null;

    return [
      {
        name: "file",
        targetTokens: null,
        theme: "custom",
        filePath,
        maxChars:
          Number.isFinite(maxChars)
            ? maxChars
            : null
      }
    ];
  }

  const argument =
    process.argv.find(arg =>
      arg.startsWith(
        "--cases="
      )
    );

  if (!argument) {
    return TARGET_CASES;
  }

  const names = new Set(
    argument
      .slice("--cases=".length)
      .split(",")
      .map(value =>
        value.trim()
      )
      .filter(Boolean)
  );

  const cases =
    TARGET_CASES.filter(
      promptCase =>
        names.has(
          promptCase.name
        )
    );

  if (!cases.length) {
    throw new Error(
      `No matching cases for ${argument}.`
    );
  }

  return cases;
}

function selectedModels() {
  const argument =
    process.argv.find(arg =>
      arg.startsWith(
        "--models="
      )
    );

  if (!argument) {
    return MODELS;
  }

  const requested =
    new Set(
      argument
        .slice("--models=".length)
        .split(",")
        .map(value =>
          value.trim()
        )
        .filter(Boolean)
    );

  const models =
    MODELS.filter(model =>
      (
        model.name === null &&
        requested.has("auto")
      ) ||
      requested.has(
        String(model.name)
      ) ||
      requested.has(
        model.label
      )
    );

  if (!models.length) {
    throw new Error(
      `No matching models for ${argument}.`
    );
  }

  return models;
}

function selectedMode(
  promptCase
) {
  const argument =
    process.argv.find(arg =>
      arg.startsWith(
        "--mode="
      )
    );

  if (argument) {
    const mode =
      argument
        .slice("--mode=".length)
        .trim()
        .toLowerCase();

    if (
      [
        "auto",
        "safe",
        "balanced",
        "maximum"
      ].includes(mode)
    ) {
      return mode;
    }

    throw new Error(
      `Unsupported mode: ${mode}.`
    );
  }

  return promptCase.targetTokens >=
    12_000
    ? "maximum"
    : "balanced";
}

function parseEnvFile() {
  const raw =
    fs.readFileSync(
      ENV_PATH,
      "utf8"
    );

  const values = {};

  for (const line of raw.split("\n")) {
    const trimmed =
      line.trim();

    if (
      !trimmed ||
      trimmed.startsWith("#")
    ) {
      continue;
    }

    const index =
      trimmed.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      trimmed
        .slice(0, index)
        .trim();

    const value =
      trimmed
        .slice(index + 1)
        .trim();

    values[key] = value;
  }

  return values;
}

function loadTokyraModule() {
  const sourcePath =
    new URL(
      "./tokyra-worker.js",
      ROOT
    );

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
    "\n\nglobalThis.__tokyra = { optimizePrompt, estimateTokens, normalizeText };\n";

  const sandbox = {
    console,
    TextEncoder,
    crypto:
      crypto.webcrypto,
    URL,
    Response,
    Request,
    AbortController,
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

const {
  optimizePrompt,
  estimateTokens,
  normalizeText
} = loadTokyraModule();

function repeatedSentence(
  theme,
  index
) {
  const blocks = {
    support:
      `If the user reports authentication failures, preserve "Authorization" and "Bearer <token>" exactly, mention token scope, expiry, and header formatting, and do not hide operational caveats. Ticket ${index}.`,
    api:
      `Preserve JSON keys exactly, retain endpoint paths like "/v1/projects" and "/v1/chat/completions", and keep examples accurate enough for implementation. Revision ${index}.`,
    writer:
      `Preserve audience, tone, banned phrasing, structure, and word-count rules while removing filler, repeated framing, and low-signal repetition from the brief. Draft ${index}.`,
    code:
      `Preserve function names, parameters, return types, error handling, output format, and code behavior; prefer minimal diffs and never silently change runtime behavior. Module ${index}.`,
    ops:
      `Mention retries with exponential backoff for transient 5xx failures, rate limits for 429s, eventual consistency for missing data, and region names "us-east-1" and "eu-west-1" when relevant. Runbook ${index}.`,
    policy:
      `Preserve every prohibition, exception, escalation rule, and audit requirement, but compress duplicate explanations, repeated reminders, and non-operative prose. Policy section ${index}.`,
    agent:
      `Preserve role, task, tool constraints, output schema, stopping conditions, exact literals, code fences, and examples that define behavior across multi-step agent execution. Agent step ${index}.`,
    mixed:
      `Keep technical literals, behavioral examples, exact headers, JSON keys, code fences, formatting requirements, and safety constraints while aggressively trimming duplicated framing language. Segment ${index}.`
  };

  return blocks[theme];
}

function fixedArtifacts(
  targetTokens
) {
  if (targetTokens <= 150) {
    return [
      `Preserve exact literals when relevant: "Authorization", "Bearer <token>", "/v1/projects".`,
      `Use short sections and bullets for operational steps. Do not invent unsupported endpoints.`
    ].join("\n\n");
  }

  if (targetTokens <= 700) {
    return [
      `Preserve exact literals when relevant: "Authorization", "Bearer <token>", "/v1/projects", "/v1/chat/completions", "retention_days".`,
      `Use short sections with clear headings. Use bullets for operational steps. Do not invent unsupported endpoints.`,
      `Keep this example verbatim if reused:\n\n\`\`\`ts\nfetch("/v1/chat/completions", {\n  headers: {\n    "Authorization": "Bearer <token>"\n  }\n});\n\`\`\``
    ].join("\n\n");
  }

  return [
    `Exact literals that should survive if relevant: "Authorization", "Bearer <token>", "/v1/projects", "/v1/chat/completions", "retention_days", "max_output_tokens", "alpha-2".`,
    `Use short sections with clear headings. Use bullets for operational steps. Do not invent unsupported endpoints.`,
    `Keep this code fence verbatim if reused:\n\n\`\`\`ts\nconst response = await fetch("/v1/chat/completions", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer <token>",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    model: "alpha-2",\n    input: "Summarize the latest incident",\n    max_output_tokens: 800\n  })\n});\n\`\`\``,
    `If a JSON schema appears, preserve field names exactly: {"name":"string","environment":"dev | staging | prod","region":"us-east-1 | eu-west-1","retention_days":30}.`
  ].join("\n\n");
}

function buildPrompt({
  targetTokens,
  theme
}) {
  const introText =
    fixedArtifacts(
      targetTokens
    );

  const intro = normalizeText(`
You are Tokyra evaluation input ${theme}. This prompt is intentionally verbose so a compression system can remove redundant framing while preserving behavior, literals, and formatting guarantees.

${introText}
  `);

  const unit =
    normalizeText(`
${repeatedSentence(theme, 1)}

Please make sure the answer is organized and readable. Please make sure the answer is organized and readable. Please make sure the answer is organized and readable.

Do not invent fields. Do not invent fields. Do not invent fields.
    `);

  const introTokens =
    estimateTokens(intro);

  const unitTokens =
    Math.max(
      1,
      estimateTokens(unit)
    );

  const neededUnits =
    Math.max(
      1,
      Math.ceil(
        (targetTokens -
          introTokens) /
          unitTokens
      )
    );

  const parts = [intro];

  for (
    let index = 1;
    index <= neededUnits;
    index += 1
  ) {
    parts.push(
      repeatedSentence(
        theme,
        index
      )
    );

    if (index % 3 === 0) {
      parts.push(
        `Please make sure the answer is organized and readable. Please make sure the answer is organized and readable. Please make sure the answer is organized and readable.`
      );
    }

    if (index % 5 === 0) {
      parts.push(
        `Do not invent fields. Do not invent fields. Do not invent fields.`
      );
    }
  }

  while (
    parts.length > 1 &&
    estimateTokens(
      parts.join("\n\n")
    ) > targetTokens
  ) {
    parts.pop();
  }

  let output =
    normalizeText(
      parts.join("\n\n")
    );

  let refillIndex =
    neededUnits + 1;

  while (
    estimateTokens(output) <
      targetTokens * 0.92
  ) {
    const additions = [
      repeatedSentence(
        theme,
        refillIndex
      )
    ];

    if (
      refillIndex % 3 === 0
    ) {
      additions.push(
        `Please make sure the answer is organized and readable. Please make sure the answer is organized and readable. Please make sure the answer is organized and readable.`
      );
    }

    if (
      refillIndex % 5 === 0
    ) {
      additions.push(
        `Do not invent fields. Do not invent fields. Do not invent fields.`
      );
    }

    output =
      normalizeText(
        `${output}\n\n${additions.join("\n\n")}`
      );

    refillIndex += 1;
  }

  return output;
}

async function runCloudflareModel(
  credentials,
  model,
  payload,
  externalSignal
) {
  const controller =
    new AbortController();

  const forwardAbort = () =>
    controller.abort(
      externalSignal &&
      "reason" in externalSignal
        ? externalSignal.reason
        : "Tokyra optimization budget exhausted"
    );

  if (externalSignal) {
    if (externalSignal.aborted) {
      forwardAbort();
    } else {
      externalSignal.addEventListener(
        "abort",
        forwardAbort,
        { once: true }
      );
    }
  }

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      10 * 60 * 1000
    );

  try {
    const response =
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${credentials.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${credentials.CLOUDFLARE_API_TOKEN}`,
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(
              payload
            ),
          signal:
            controller.signal
        }
      );

    const text =
      await response.text();

    let body =
      null;

    try {
      body =
        JSON.parse(text);
    } catch {
      body = {
        raw: text
      };
    }

    if (
      !response.ok ||
      (
        typeof body ===
          "object" &&
        body &&
        body.success === false
      )
    ) {
      const message =
        body &&
        body.errors &&
        body.errors[0] &&
        body.errors[0].message
          ? body.errors[0].message
          : (
            body &&
            body.raw
              ? body.raw
              : `HTTP ${response.status}`
          );

      const error =
        new Error(message);

      error.status =
        response.status;

      error.body = body;

      throw error;
    }

    return body;
  } finally {
    clearTimeout(timeout);

    if (externalSignal) {
      externalSignal.removeEventListener(
        "abort",
        forwardAbort
      );
    }
  }
}

function shouldRunModelForCase(
  model,
  targetTokens
) {
  return (
    targetTokens <
    model.maxInputTokens * 0.9
  );
}

function makeSummaryLine(
  result
) {
  if (result.error) {
    return (
      `${result.caseName} | ${result.modelLabel} | ` +
      `error | ${result.error.message}`
    );
  }

  return (
    `${result.caseName} | ${result.modelLabel} | ` +
    `input=${result.originalTokens} | output=${result.optimizedTokens} | ` +
    `compression=${result.compressionPercent}% | ` +
    `accepted=${result.accepted} | method=${result.method} | ` +
    `status=${result.status} | latency=${result.latencyMs}ms`
  );
}

async function main() {
  const credentials =
    parseEnvFile();
  const promptCases =
    selectedCases();
  const models =
    selectedModels();

  if (
    !credentials.CLOUDFLARE_ACCOUNT_ID ||
    !credentials.CLOUDFLARE_API_TOKEN
  ) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN."
    );
  }

  const results = [];

  console.log(
    `Running cases: ${promptCases
      .map(promptCase =>
        promptCase.name
      )
      .join(", ")}`
  );

  for (const promptCase of promptCases) {
    console.log(
      `Preparing ${promptCase.name}...`
    );

    const prompt =
      promptCase.filePath
        ? normalizeText(
            fs
              .readFileSync(
                promptCase.filePath,
                "utf8"
              )
              .slice(
                0,
                promptCase.maxChars ??
                  undefined
              )
          )
        : buildPrompt(promptCase);

    const actualPromptTokens =
      estimateTokens(prompt);

    for (const model of models) {
      if (
        !shouldRunModelForCase(
          model,
          actualPromptTokens
        )
      ) {
        const skipped = {
          caseName:
            promptCase.name,
          targetTokens:
            promptCase.targetTokens,
          actualPromptTokens,
          model:
            model.name ||
            "auto",
          modelLabel:
            model.label,
          skipped: true,
          reason:
            "target exceeds conservative model context threshold"
        };

        results.push(skipped);
        console.log(
          `${promptCase.name} | ${model.label} | skipped`
        );
        fs.writeFileSync(
          RESULTS_PATH,
          JSON.stringify(
            results,
            null,
            2
          )
        );
        continue;
      }

      console.log(
        `Running ${promptCase.name} on ${model.label}...`
      );

      const startedAt =
        Date.now();

      try {
        const env = {
          DIAGNOSTIC_CANDIDATES:
            "true",
          AI: {
            async run(
              selectedModel,
              payload,
              options
            ) {
              return runCloudflareModel(
                credentials,
                selectedModel,
                payload,
                options &&
                  options.signal
              );
            }
          }
        };

        if (model.name) {
          env.AI_MODEL =
            model.name;
        }

        const result =
          await optimizePrompt(
            env,
            prompt,
            {
              mode:
                selectedMode(
                  promptCase
                )
            }
          );

        const record = {
          caseName:
            promptCase.name,
          theme:
            promptCase.theme,
          targetTokens:
            promptCase.targetTokens,
          actualPromptTokens:
          actualPromptTokens,
          model:
            model.name ||
            "auto",
          modelLabel:
            model.label,
          wallClockMs:
            Date.now() -
            startedAt,
          ...result
        };

        results.push(record);
        console.log(
          makeSummaryLine(record)
        );
      } catch (error) {
        const record = {
          caseName:
            promptCase.name,
          theme:
            promptCase.theme,
          targetTokens:
            promptCase.targetTokens,
          actualPromptTokens:
          actualPromptTokens,
          model:
            model.name ||
            "auto",
          modelLabel:
            model.label,
          wallClockMs:
            Date.now() -
            startedAt,
          error: {
            message:
              error.message,
            status:
              error.status ||
              null
          }
        };

        results.push(record);
        console.log(
          makeSummaryLine(record)
        );
      }

      fs.writeFileSync(
        RESULTS_PATH,
        JSON.stringify(
          results,
          null,
          2
        )
      );
    }
  }

  console.log(
    `Saved results to ${RESULTS_PATH.pathname}`
  );
}

await main();
