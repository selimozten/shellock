import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("repository-wide scanning is a discoverable workflow skill rather than a command", async () => {
  const skill = await readFile(resolve("resources/skills/repository-security-scan/SKILL.md"), "utf8");

  assert.match(skill, /^---\nname: repository-security-scan\n/m);
  assert.match(skill, /Use when the user asks to scan, audit, assess, or review an entire repository/);
  assert.match(skill, /Discover relevant installed tools/);
  assert.match(skill, /Scanner output is a lead, not a finding/);
  assert.match(skill, /coverage: surfaces reviewed, tools used, exclusions, failed checks, and residual risk/i);
  assert.match(skill, /workflow, not a fixed command or scanner bundle/);
  assert.doesNotMatch(skill, /\/shellock-scan|registerCommand/i);
});
