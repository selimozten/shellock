import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentPrompt } from "../dist/agent/prompt-pack.js";

test("assessment prompt keeps Shellock capable, tool-aware, and workflow-neutral", () => {
  const prompt = buildAssessmentPrompt();

  assert.match(prompt, /native read, write, edit, and bash tools/);
  assert.match(prompt, /Discover what is available/);
  assert.match(prompt, /Load a relevant skill/);
  assert.match(prompt, /repository-wide security scans/);
  assert.match(prompt, /Do not impose a mission format, case file, report schema, command ritual, or fixed workflow/);
  assert.doesNotMatch(prompt, /MISSION\.md|STATE\.md|SURFACE\.md|COVERAGE\.md|THREAT_MODEL\.md|shellock-init/);
});
