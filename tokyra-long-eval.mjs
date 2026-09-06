import fs from "node:fs";

const root = new URL("./", import.meta.url);

function readEnv() {
  const values = {};
  const raw = fs.readFileSync(
    new URL("./cloudflare-test.env", root),
    "utf8"
  );

  for (const line of raw.split("\n")) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const separator = value.indexOf("=");
    if (separator < 1) continue;
    values[value.slice(0, separator).trim()] =
      value.slice(separator + 1).trim();
  }

  return values;
}

const credentials = readEnv();
const workerSource =
  fs.readFileSync(
    new URL("./tokyra-worker.js", root),
    "utf8"
  ) + "\nexport { optimizePrompt };";

const { optimizePrompt } = await import(
  `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`
);

const prompt = fs.readFileSync(
  new URL("./tokyra-long-regression.txt", root),
  "utf8"
);

const env = {
  AI: {
    async run(model, payload) {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${credentials.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.CLOUDFLARE_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      const body = await response.json();
      if (!response.ok || body.success === false) {
        throw new Error(`Workers AI HTTP ${response.status}`);
      }

      return body.result ?? body;
    }
  }
};

const result = await optimizePrompt(
  env,
  prompt,
  {
    mode: "maximum",
    targetReduction: 90,
    debugCandidates: true
  }
);

console.log(
  JSON.stringify(
    {
      originalTokens: result.originalTokens,
      optimizedTokens: result.optimizedTokens,
      compressionPercent: result.compressionPercentPrecise,
      fidelityPercent: result.fidelityPercent,
      requirementCoveragePercent: result.requirementCoveragePercent,
      literalCoveragePercent: result.literalCoveragePercent,
      negationCoveragePercent: result.negationCoveragePercent,
      method: result.method,
      judge: result.semanticJudge,
      providerErrors: result.providerErrors,
      candidateSummary: result.candidateSummary,
      optimized: result.optimized
    },
    null,
    2
  )
);
