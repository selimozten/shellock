import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildAssessmentPrompt } from "../../agent/prompt-pack.js";
import { formatDoctorReport, runDoctor } from "../../doctor/doctor.js";
import { generateReport } from "../../report/report.js";
import { runRuntimeCommand } from "../../runtime/commands.js";
import { completeRun, type ShellockRun, startRun } from "../../workspace/lifecycle.js";
import {
  commandsTemplate,
  coverageTemplate,
  stateTemplate,
  surfaceTemplate,
  threatModelTemplate,
} from "../../workspace/templates.js";
import { initializeWorkspace, readMissionWorkspace, workspacePaths } from "../../workspace/workspace.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export default function shellockExtension(pi: ExtensionAPI) {
  const activeRuns = new Map<string, ShellockRun>();

  pi.on("resources_discover", () => ({
    skillPaths: [join(PACKAGE_ROOT, "skills")],
    promptPaths: [join(PACKAGE_ROOT, "prompts")],
  }));

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n## Shellock Pack\n\n${buildAssessmentPrompt()}`,
  }));

  pi.on("session_start", async (_event, ctx) => {
    let status = await getCaseFileStatus(ctx.cwd);
    if (status.hasMission) {
      await ensureCaseFile(ctx.cwd);
      status = await getCaseFileStatus(ctx.cwd);
    }
    applyTerminalBranding(ctx, status);
  });

  pi.registerCommand("shellock", {
    description: "Continue the authorized Shellock mission through the normal Pi agent turn",
    handler: async (args, ctx) => {
      const task = args.trim();
      const status = await getCaseFileStatus(ctx.cwd);
      if (!status.hasMission) {
        ctx.ui.notify("No MISSION.md found. Use /shellock-init <authorized mission> before mission work.", "warning");
        return;
      }

      await ensureCaseFile(ctx.cwd);
      const message = buildShellockContinuationMessage(task);
      if (ctx.isIdle()) {
        pi.sendUserMessage(message);
      } else {
        pi.sendUserMessage(message, { deliverAs: "followUp" });
        ctx.ui.notify("Shellock mission continuation queued.", "info");
      }
    },
  });

  pi.registerCommand("shellock-init", {
    description: "Create a markdown security case file in the current Pi working directory",
    handler: async (args, ctx) => {
      const mission = args.trim();
      if (!mission) {
        ctx.ui.notify("Usage: /shellock-init <authorized mission text>", "warning");
        return;
      }

      const status = await getCaseFileStatus(ctx.cwd);
      if (status.hasMission) {
        ctx.ui.notify("MISSION.md already exists; refusing to overwrite the current case file.", "warning");
        return;
      }

      await initializeWorkspace(ctx.cwd, mission);
      applyTerminalBranding(ctx, await getCaseFileStatus(ctx.cwd));
      ctx.ui.notify(`Created security case file in ${ctx.cwd}`, "info");
    },
  });

  pi.registerCommand("shellock-status", {
    description: "Show security case-file and runtime status",
    handler: async (_args, ctx) => {
      const status = await getCaseFileStatus(ctx.cwd);
      const runtime = runtimeStatus();
      ctx.ui.notify(
        [
          `case file: ${status.hasMission ? "ready" : "missing MISSION.md"}`,
          `hypotheses: ${status.hypothesisCount}`,
          `findings: ${status.findingCount}`,
          `runs: ${status.runCount}`,
          `runtime: ${runtime}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.registerCommand("shellock-report", {
    description: "Generate reports/REPORT.md from the current security case file",
    handler: async (_args, ctx) => {
      const workspace = await readMissionWorkspace(ctx.cwd);
      await ensureCaseFile(ctx.cwd);
      const reportPath = await generateReport(workspace);
      ctx.ui.notify(`Generated ${reportPath}`, "info");
    },
  });

  pi.registerCommand("shellock-runtime", {
    description: "Inspect and manage Shellock runtime sessions",
    handler: async (args, ctx) => {
      try {
        const output = await runRuntimeCommand(args, {
          cwd: ctx.cwd,
          runtimeStatus,
        });
        applyTerminalBranding(ctx, await getCaseFileStatus(ctx.cwd));
        ctx.ui.notify(output, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("shellock-doctor", {
    description: "Check Shellock config, case file, runtime, and security tool profile",
    handler: async (_args, ctx) => {
      const report = await runDoctor({ workspaceRoot: ctx.cwd });
      ctx.ui.notify(formatDoctorReport(report), report.checks.some((check) => check.status === "fail") ? "error" : "info");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    if (!existsSync(workspacePaths(ctx.cwd).missionFile)) return;

    const command = typeof event.input.command === "string" ? event.input.command : "";
    if (!command.trim()) return;

    await ensureCaseFile(ctx.cwd);
    const run = await startRun(ctx.cwd, {
      toolCallId: event.toolCallId,
      command,
      cwd: ctx.cwd,
      runtime: runtimeStatus(),
    });
    activeRuns.set(event.toolCallId, run);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const run = activeRuns.get(event.toolCallId);
    if (!run) return;
    activeRuns.delete(event.toolCallId);

    const fullOutputPath = getFullOutputPath(event.details);
    const completion = {
      isError: event.isError,
      outputText: textContent(event.content),
    };

    await completeRun(ctx.cwd, run, fullOutputPath ? { ...completion, fullOutputPath } : completion);
  });
}

type CaseFileStatus = Awaited<ReturnType<typeof getCaseFileStatus>>;

function applyTerminalBranding(ctx: ExtensionContext, status: CaseFileStatus): void {
  ctx.ui.setStatus("shellock", ctx.ui.theme.fg("accent", shellockStatusText(status)));

  if (ctx.mode !== "tui" || !ctx.hasUI) return;

  ctx.ui.setTitle(`Shellock - ${basename(ctx.cwd)} - ${status.hasMission ? "case" : "pack"}`);
  ctx.ui.setHiddenThinkingLabel("operator notes");
  ctx.ui.setWorkingMessage(status.hasMission ? "Shellock is working the case" : "Shellock is thinking");
  ctx.ui.setHeader((_tui, theme) => ({
    invalidate() {},
    render(width: number): string[] {
      const brand = theme.bold(theme.fg("accent", "shellock"));
      const role = theme.fg("muted", "security research harness");
      const caseText = status.hasMission ? theme.fg("success", "case ready") : theme.fg("warning", "case none");
      const runtime = theme.fg("muted", `runtime ${shortRuntimeStatus()}`);
      const state = status.hasMission
        ? theme.fg("muted", `record h${status.hypothesisCount} f${status.findingCount} r${status.runCount}`)
        : theme.fg("muted", "state awaiting authorization");
      const action = status.hasMission
        ? theme.fg("dim", "next /shellock-status  /shellock <task>")
        : theme.fg("dim", "start /shellock-init <authorized mission>");

      return [
        truncateToWidth(`${brand} ${role}`, width, theme.fg("dim", "...")),
        truncateToWidth(`${caseText}  ${runtime}  ${state}`, width, theme.fg("dim", "...")),
        truncateToWidth(action, width, theme.fg("dim", "...")),
      ];
    },
  }));
}

function shellockStatusText(status: CaseFileStatus): string {
  if (!status.hasMission) return `shellock:pack ${shortRuntimeStatus()}`;

  return `shellock:case h${status.hypothesisCount} f${status.findingCount} r${status.runCount} ${shortRuntimeStatus()}`;
}

function shortRuntimeStatus(): string {
  const status = runtimeStatus();
  return status === "local Pi bash" ? "local bash" : status;
}

async function ensureCaseFile(root: string): Promise<void> {
  const workspace = workspacePaths(root);
  await Promise.all([
    mkdir(workspace.hypothesesDir, { recursive: true }),
    mkdir(workspace.findingsDir, { recursive: true }),
    mkdir(workspace.evidenceDir, { recursive: true }),
    mkdir(workspace.runsDir, { recursive: true }),
    mkdir(workspace.reportsDir, { recursive: true }),
    mkdir(workspace.scratchDir, { recursive: true }),
  ]);

  await Promise.all([
    writeIfMissing(workspace.stateFile, stateTemplate()),
    writeIfMissing(workspace.surfaceFile, surfaceTemplate()),
    writeIfMissing(workspace.coverageFile, coverageTemplate()),
    writeIfMissing(workspace.commandsFile, commandsTemplate()),
    writeIfMissing(workspace.threatModelFile, threatModelTemplate()),
  ]);
}

async function getCaseFileStatus(root: string): Promise<{
  hasMission: boolean;
  hypothesisCount: number;
  findingCount: number;
  runCount: number;
}> {
  const workspace = workspacePaths(root);
  const [hypothesisCount, findingCount, runCount] = await Promise.all([
    countMarkdownFiles(workspace.hypothesesDir),
    countMarkdownFiles(workspace.findingsDir),
    countDirectories(workspace.runsDir),
  ]);

  return {
    hasMission: existsSync(workspace.missionFile),
    hypothesisCount,
    findingCount,
    runCount,
  };
}

async function countMarkdownFiles(path: string): Promise<number> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

async function countDirectories(path: string): Promise<number> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

async function writeIfMissing(path: string, content: string): Promise<void> {
  try {
    await readFile(path, "utf8");
  } catch {
    await writeFile(path, content, "utf8");
  }
}

function runtimeStatus(): string {
  const instance = process.env.SHELLOCK_INCUS_INSTANCE;
  if (!instance) return "local Pi bash";

  const guestWorkspace = process.env.SHELLOCK_WORKSPACE_GUEST ?? "/workspace";
  return `Incus ${instance} mounted at ${guestWorkspace}`;
}

function buildShellockContinuationMessage(task: string): string {
  const requestedTask = task || "Continue the current authorized security mission from the case file.";
  return [
    "Continue Shellock mission work from the markdown case file in this workspace.",
    "",
    `User task: ${requestedTask}`,
    "",
    "Before acting, read MISSION.md, STATE.md, SURFACE.md, COVERAGE.md, and THREAT_MODEL.md.",
    "Use the normal Pi terminal agent loop and Shellock evidence discipline.",
  ].join("\n");
}

function textContent(content: Array<{ type?: string; text?: string }>): string {
  return content
    .map((entry) => (entry.type === "text" && typeof entry.text === "string" ? entry.text : ""))
    .filter(Boolean)
    .join("\n");
}

function getFullOutputPath(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const value = (details as { fullOutputPath?: unknown }).fullOutputPath;
  return typeof value === "string" ? value : undefined;
}
