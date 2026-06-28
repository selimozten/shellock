import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  initializeWorkspace,
  readMissionWorkspace,
  writeFinding,
} from "../dist/workspace/workspace.js";
import { completeRun, startRun } from "../dist/workspace/lifecycle.js";
import { formatDoctorReport, runDoctor } from "../dist/doctor/doctor.js";
import { createHypothesis } from "../dist/workspace/hypotheses.js";
import { generateReport } from "../dist/report/report.js";

test("initializes a mission workspace and generates a report", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-"));
  try {
    const workspace = await initializeWorkspace(root, "Assess an authorized lab target.");
    const loaded = await readMissionWorkspace(root);
    assert.equal(loaded.root, workspace.root);

    const threatModel = await readFile(workspace.threatModelFile, "utf8");
    assert.match(threatModel, /# Threat Model/);

    const hypothesisPath = await createHypothesis(workspace, "The login endpoint may expose weak authentication handling.");
    const hypothesis = await readFile(hypothesisPath, "utf8");
    assert.match(hypothesis, /HYP-001/);

    await writeFinding(workspace, {
      id: "RF-001",
      title: "Example validated finding",
      status: "validated",
      severity: "medium",
      confidence: "high",
      affectedAssets: ["lab.local"],
      summary: "Example summary.",
      impact: "Example impact.",
      evidenceLinks: ["evidence/RF-001/stdout.txt"],
      reproduction: ["Run the documented command."],
      remediation: "Patch the vulnerable component.",
      openQuestions: [],
    });

    const reportPath = await generateReport(workspace);
    const report = await readFile(reportPath, "utf8");
    assert.match(report, /Security Assessment Report/);
    assert.match(report, /Threat Model/);
    assert.match(report, /Example validated finding/);
    assert.match(report, /## Validated Findings/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report gates weak findings out of validated findings section", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-"));
  try {
    const workspace = await initializeWorkspace(root, "Assess an authorized lab target.");
    await writeFinding(workspace, {
      id: "RF-001",
      title: "Validated evidence-backed issue",
      status: "validated",
      severity: "high",
      confidence: "high",
      affectedAssets: ["https://lab.local/login"],
      summary: "The login endpoint accepts a replayed session token.",
      impact: "An attacker with a captured token can reuse it until expiry.",
      evidenceLinks: ["evidence/runs/RUN-001/output.txt"],
      reproduction: ["Capture a session token.", "Replay the token against /login.", "Observe authenticated access."],
      remediation: "Bind tokens to session context and shorten token lifetime.",
      openQuestions: [],
    });
    await writeFinding(workspace, {
      id: "RF-002",
      title: "Scanner-only weak lead",
      status: "lead",
      severity: "medium",
      confidence: "low",
      affectedAssets: [],
      summary: "A scanner emitted a possible issue.",
      impact: "Unknown.",
      evidenceLinks: [],
      reproduction: [],
      remediation: "Unknown.",
      openQuestions: ["Needs manual validation."],
    });

    const reportPath = await generateReport(workspace);
    const report = await readFile(reportPath, "utf8");
    const validatedSection = report.split("## Non-Reportable Leads And Candidates")[0];

    assert.match(validatedSection, /Validated evidence-backed issue/);
    assert.doesNotMatch(validatedSection, /Scanner-only weak lead/);
    assert.match(report, /RF-002: Scanner-only weak lead/);
    assert.match(report, /blocked: status is lead/);
    assert.match(report, /evidence links are missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records bash runs as durable evidence manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-"));
  try {
    await initializeWorkspace(root, "Assess an authorized lab target.");
    const run = await startRun(root, {
      toolCallId: "toolu_1234567890",
      command: "printf 'hello shellock'",
      cwd: root,
      runtime: "local bash",
    });

    await completeRun(root, run, {
      isError: false,
      outputText: "hello shellock",
    });

    const manifest = await readFile(run.manifestPath, "utf8");
    assert.match(manifest, /status: completed/);
    assert.match(manifest, /printf 'hello shellock'/);

    const output = await readFile(run.outputPath, "utf8");
    assert.match(output, /hello shellock/);

    const commands = await readFile(join(root, "COMMANDS.md"), "utf8");
    assert.match(commands, new RegExp(run.id));
    assert.match(commands, /evidence\/runs\/RUN-/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("doctor reports case file and tool profile status", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-"));
  try {
    await initializeWorkspace(root, "Assess an authorized lab target.");
    const report = await runDoctor({ workspaceRoot: root });
    const text = formatDoctorReport(report);
    assert.match(text, /Shellock doctor/);
    assert.match(text, /case file: mission workspace is complete/);
    for (const profile of ["base", "net-basic", "net-advanced", "lab", "vm-danger"]) {
      assert.match(text, new RegExp(`asset:incus ${profile} profile`));
    }
    assert.match(text, /tools:core/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
