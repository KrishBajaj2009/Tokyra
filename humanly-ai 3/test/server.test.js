"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeText, cleanText, localHumanize } = require("../server");

test("cleanText normalizes line endings and extra blank lines", () => {
  assert.equal(cleanText("Hello  \r\n\r\n\r\n\r\nworld"), "Hello\n\n\nworld");
});

test("localHumanize removes common formal filler without changing facts", () => {
  const input = "It is important to note that we utilize 14 sensors in order to monitor Room 7.";
  const output = localHumanize(input, "balanced");
  assert.match(output, /14 sensors/);
  assert.match(output, /Room 7/);
  assert.doesNotMatch(output, /important to note/i);
  assert.match(output, /use 14 sensors to monitor/);
});

test("analysis returns bounded, transparent metrics", () => {
  const result = analyzeText("I tried the new flow yesterday. It worked, mostly—but the last screen still feels odd. I'll test it again tomorrow.");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(["AI-patterned", "Human-leaning", "Inconclusive"].includes(result.verdict));
  assert.equal(typeof result.metrics.sentenceVariation, "number");
  assert.match(result.attribution, /cannot reliably identify/);
});
