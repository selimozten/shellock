import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentPrompt } from "../dist/agent/prompt-pack.js";

test("assessment prompt explains native Pi tool use", () => {
  const prompt = buildAssessmentPrompt();

  assert.match(prompt, /Pi harness tool-use contract/);
  assert.match(prompt, /Use read to inspect file contents and specific file regions/);
  assert.match(prompt, /Use grep, find, and ls to locate files/);
  assert.match(prompt, /Use edit for targeted file modifications/);
  assert.match(prompt, /Use bash for commands, tests, package managers/);
  assert.match(prompt, /Do not run Python, Node, awk, sed, or shell one-liners only to print specific lines/);
  assert.match(prompt, /Do not delete, move, chmod, chown, overwrite, or clean files through bash/);
});
