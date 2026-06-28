import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
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
const PACKAGE_VERSION = readPackageVersion();
const SHELLOCK_ASCII = [
  "  ____  _          _ _            _    ",
  " / ___|| |__   ___| | | ___   ___| | __",
  " \\___ \\| '_ \\ / _ \\ | |/ _ \\ / __| |/ /",
  "  ___) | | | |  __/ | | (_) | (__|   < ",
  " |____/|_| |_|\\___|_|_|\\___/ \\___|_|\\_\\",
];

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
  ctx.ui.setHiddenThinkingLabel("reasoning hidden");
  ctx.ui.setWorkingMessage(status.hasMission ? "Shellock is working the case" : "Shellock is thinking");
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new ShellockEditor(tui, theme, keybindings, ctx, status));
  ctx.ui.setHeader((_tui, theme) => new ShellockHeader(ctx, status, PACKAGE_VERSION, theme));
}

class ShellockHeader {
  constructor(
    private readonly ctx: ExtensionContext,
    private readonly status: CaseFileStatus,
    private readonly version: string,
    private readonly theme: ExtensionContext["ui"]["theme"],
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    if (width < 72) return this.renderCompact(width);

    const boxWidth = Math.max(72, width);
    const innerWidth = boxWidth - 2;
    if (innerWidth < 94) return this.renderSingleColumn(boxWidth);

    const leftWidth = Math.min(44, Math.max(34, Math.floor(innerWidth * 0.34)));
    const rightWidth = innerWidth - leftWidth - 1;
    const leftRows = this.leftPanel(leftWidth);
    const rightRows = this.rightPanel(rightWidth);
    const rowCount = Math.max(leftRows.length, rightRows.length);
    const lines = [this.topBorder(boxWidth)];

    for (let index = 0; index < rowCount; index++) {
      lines.push(this.splitRow(leftRows[index] ?? "", leftWidth, rightRows[index] ?? "", rightWidth));
    }

    lines.push(this.bottomBorder(boxWidth));
    return lines;
  }

  private renderCompact(width: number): string[] {
    const theme = this.theme;
    const caseText = this.status.hasMission ? "case ready" : "case none";
    return [
      fitText(`${theme.bold(theme.fg("accent", "shellock"))} ${theme.fg("muted", `v${this.version}`)}`, width),
      fitText(`${theme.fg("warning", caseText)}  ${theme.fg("muted", shortRuntimeStatus())}`, width),
      fitText(theme.fg("dim", this.primaryAction()), width),
    ];
  }

  private renderSingleColumn(boxWidth: number): string[] {
    const innerWidth = boxWidth - 2;
    const rows = [
      this.theme.bold(this.theme.fg("accent", "SHELLOCK")),
      this.statusLine(),
      this.modelLine(),
      compactCwd(this.ctx.cwd),
      separatorText(innerWidth, this.theme),
      this.theme.bold(this.theme.fg("accent", "Mission")),
      this.primaryAction(),
      this.recordLine(),
      separatorText(innerWidth, this.theme),
      this.theme.bold(this.theme.fg("accent", "Tool contract")),
      "read/grep/find/ls inspect files and locate text",
      "edit/write change files through Pi tools",
      "bash runs tests, scanners, package managers, runtime ops",
      "avoid Python just to print specific file lines",
    ];

    return [this.topBorder(boxWidth), ...rows.map(row => this.row(row, innerWidth)), this.bottomBorder(boxWidth)];
  }

  private leftPanel(width: number): string[] {
    const theme = this.theme;
    return [
      "",
      centerText(theme.bold(theme.fg("accent", "SHELLOCK")), width),
      "",
      ...SHELLOCK_ASCII.map(line => centerText(theme.fg("muted", line), width)),
      "",
      centerText(theme.fg("muted", this.modelLine()), width),
      centerText(theme.fg("muted", this.contextLine()), width),
      centerText(theme.fg("muted", compactCwd(this.ctx.cwd)), width),
    ];
  }

  private rightPanel(width: number): string[] {
    const theme = this.theme;
    return [
      theme.bold(theme.fg("accent", "Mission")),
      this.primaryAction(),
      this.statusLine(),
      this.recordLine(),
      separatorText(width, theme),
      theme.bold(theme.fg("accent", "Tool contract")),
      "read/grep/find/ls: inspect files and locate text",
      "edit/write: change files through Pi tools",
      "bash: tests, scanners, package managers, runtime ops",
      "avoid Python just to print specific file lines",
    ];
  }

  private topBorder(width: number): string {
    const theme = this.theme;
    const innerWidth = width - 2;
    const title = ` Shellock v${this.version} `;
    const prefix = "---";
    const fillWidth = Math.max(0, innerWidth - visibleWidth(prefix) - visibleWidth(title));
    return `${theme.fg("borderMuted", "+")}${theme.fg("borderMuted", prefix)}${theme.bold(theme.fg("accent", title))}${theme.fg("borderMuted", "-".repeat(fillWidth))}${theme.fg("borderMuted", "+")}`;
  }

  private bottomBorder(width: number): string {
    return this.theme.fg("borderMuted", `+${"-".repeat(Math.max(0, width - 2))}+`);
  }

  private splitRow(left: string, leftWidth: number, right: string, rightWidth: number): string {
    const theme = this.theme;
    return [
      theme.fg("borderMuted", "|"),
      fitText(left, leftWidth),
      theme.fg("borderMuted", "|"),
      fitText(right, rightWidth),
      theme.fg("borderMuted", "|"),
    ].join("");
  }

  private row(content: string, width: number): string {
    return `${this.theme.fg("borderMuted", "|")}${fitText(content, width)}${this.theme.fg("borderMuted", "|")}`;
  }

  private primaryAction(): string {
    return this.status.hasMission
      ? "Next: /shellock-status or /shellock <task>"
      : "Start: /shellock-init <authorized mission>";
  }

  private statusLine(): string {
    const caseText = this.status.hasMission ? "case ready" : "case none";
    return `${caseText}  runtime ${shortRuntimeStatus()}`;
  }

  private recordLine(): string {
    if (!this.status.hasMission) return "Record: awaiting authorized mission";
    return `Record: h${this.status.hypothesisCount} f${this.status.findingCount} r${this.status.runCount}`;
  }

  private modelLine(): string {
    const model = this.ctx.model;
    if (!model) return "Model: not selected";
    const name = model.name ?? model.id;
    return `Model: ${model.provider}/${name}`;
  }

  private contextLine(): string {
    const usage = this.ctx.getContextUsage();
    const window = usage?.contextWindow ?? this.ctx.model?.contextWindow;
    return `Context: ${window ? formatTokenWindow(window) : "unknown"}`;
  }
}

class ShellockEditor extends CustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly ctx: ExtensionContext,
    private readonly status: CaseFileStatus,
  ) {
    super(tui, theme, keybindings, { paddingX: 0 });
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length < 2) return lines;

    const theme = this.ctx.ui.theme;
    const mode = this.status.hasMission ? "case" : "pack";
    const topLeft = theme.fg("accent", " shellock ");
    const topRight = theme.fg(this.status.hasMission ? "success" : "warning", ` ${mode} `);

    lines[0] = fitBorderLine(topLeft, topRight, width, text => this.borderColor(text));
    return lines;
  }
}

function fitBorderLine(left: string, right: string, width: number, border: (text: string) => string): string {
  if (width <= 0) return "";
  if (width === 1) return border("-");

  let leftText = left;
  let rightText = right;
  const fixedWidth = 2;
  const minimumGap = 1;

  while (fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width && visibleWidth(rightText) > 0) {
    rightText = truncateToWidth(rightText, Math.max(0, visibleWidth(rightText) - 1), "");
  }
  while (fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width && visibleWidth(leftText) > 0) {
    leftText = truncateToWidth(leftText, Math.max(0, visibleWidth(leftText) - 1), "");
  }

  const fillWidth = Math.max(0, width - fixedWidth - visibleWidth(leftText) - visibleWidth(rightText));
  return `${border("-")}${leftText}${border("-".repeat(fillWidth))}${rightText}${border("-")}`;
}

function fitText(text: string, width: number): string {
  if (width <= 0) return "";
  const clipped = visibleWidth(text) > width ? truncateToWidth(text, width, "") : text;
  return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}

function centerText(text: string, width: number): string {
  if (width <= 0) return "";
  const clipped = visibleWidth(text) > width ? truncateToWidth(text, width, "") : text;
  const left = Math.floor(Math.max(0, width - visibleWidth(clipped)) / 2);
  return `${" ".repeat(left)}${clipped}${" ".repeat(Math.max(0, width - left - visibleWidth(clipped)))}`;
}

function separatorText(width: number, theme: ExtensionContext["ui"]["theme"]): string {
  return theme.fg("borderMuted", "-".repeat(Math.max(0, width)));
}

function compactCwd(cwd: string): string {
  const home = process.env.HOME;
  return home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd;
}

function formatTokenWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M context`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k context`;
  return `${tokens} context`;
}

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
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
