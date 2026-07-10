import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
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
const HEADER_MAX_WIDTH = 96;
const SHELLOCK_MARK = "shellock";
const SHELLOCK_WORDMARK = [
  "       __       ____         __  ",
  "  ___ / /  ___ / / /__  ____/ /__",
  " (_-</ _ \\/ -_) / / _ \\/ __/  '_/",
  "/___/_//_/\\__/_/_/\\___/\\__/_/\\_\\ ",
];
export default function shellockExtension(pi: ExtensionAPI) {
  const activeRuns = new Map<string, ShellockRun>();

  pi.on("resources_discover", () => ({
    skillPaths: [join(PACKAGE_ROOT, "resources", "skills")],
    promptPaths: [join(PACKAGE_ROOT, "resources", "prompts")],
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

  ctx.ui.setTitle(`${basename(ctx.cwd)} - shellock`);
  ctx.ui.setHiddenThinkingLabel("reasoning");
  ctx.ui.setWorkingMessage("reasoning");
  ctx.ui.setWorkingVisible(true);
  ctx.ui.setWorkingIndicator({
    frames: [
      ctx.ui.theme.fg("dim", "·"),
      ctx.ui.theme.fg("muted", "•"),
      ctx.ui.theme.fg("accent", "●"),
      ctx.ui.theme.fg("muted", "•"),
    ],
    intervalMs: 160,
  });
  ctx.ui.setHeader((_tui, theme) => new ShellockHeader(ctx, status, PACKAGE_VERSION, theme));
  ctx.ui.setFooter((tui, theme, footerData) => new ShellockFooter(tui, ctx, status, theme, footerData));
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new ShellockEditor(tui, theme, keybindings));
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
    if (width < 56) return this.renderCompact(width);

    const boxWidth = Math.min(width - 2, HEADER_MAX_WIDTH);
    const innerWidth = boxWidth - 2;
    const boxLines = innerWidth < 80 ? this.renderSingleColumn(boxWidth) : this.renderTwoColumn(boxWidth);
    const leftPadding = " ".repeat(Math.max(0, Math.floor((width - boxWidth) / 2)));
    return boxLines.map((line) => `${leftPadding}${line}`);
  }

  private renderTwoColumn(boxWidth: number): string[] {
    const innerWidth = boxWidth - 2;
    const leftWidth = 39;
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
    return [
      fitText(`${theme.bold(theme.fg("accent", SHELLOCK_MARK))} ${theme.fg("muted", `v${this.version}`)}`, width),
      fitText(`${this.caseState()} ${theme.fg("borderMuted", "·")} ${theme.fg("muted", shortRuntimeStatus())}`, width),
      fitText(theme.fg("muted", this.primaryAction()), width),
    ];
  }

  private renderSingleColumn(boxWidth: number): string[] {
    const innerWidth = boxWidth - 2;
    const rows = [
      this.brandLine(),
      this.theme.fg("dim", "security research harness"),
      "",
      `${this.caseState()} ${this.theme.fg("borderMuted", "·")} ${this.theme.fg("muted", shortRuntimeStatus())}`,
      this.theme.fg(this.status.hasMission ? "success" : "warning", this.primaryAction()),
      this.keyValueLine("workspace", compactCwd(this.ctx.cwd), innerWidth),
    ];

    return [this.topBorder(boxWidth), ...rows.map((row) => this.row(row, innerWidth)), this.bottomBorder(boxWidth)];
  }

  private leftPanel(width: number): string[] {
    const theme = this.theme;
    return [
      ...SHELLOCK_WORDMARK.map((line) => centerText(theme.fg("muted", line), width)),
      "",
      centerText(theme.fg("dim", "security research harness"), width),
      centerText(theme.fg("borderMuted", `v${this.version}`), width),
    ];
  }

  private rightPanel(width: number): string[] {
    return [
      this.theme.bold(this.theme.fg("accent", "Mission")),
      this.theme.fg(this.status.hasMission ? "success" : "warning", this.primaryAction()),
      "",
      this.keyValueLine("state", this.caseStateText(), width),
      this.keyValueLine("runtime", shortRuntimeStatus(), width),
      this.keyValueLine("workspace", compactCwd(this.ctx.cwd), width),
    ];
  }

  private topBorder(width: number): string {
    return this.theme.fg("borderMuted", `╔${"═".repeat(Math.max(0, width - 2))}╗`);
  }

  private bottomBorder(width: number): string {
    return this.theme.fg("borderMuted", `╚${"═".repeat(Math.max(0, width - 2))}╝`);
  }

  private splitRow(left: string, leftWidth: number, right: string, rightWidth: number): string {
    const theme = this.theme;
    return [
      theme.fg("borderMuted", "║"),
      fitText(left, leftWidth),
      theme.fg("borderMuted", "│"),
      fitText(right, rightWidth),
      theme.fg("borderMuted", "║"),
    ].join("");
  }

  private row(content: string, width: number): string {
    return `${this.theme.fg("borderMuted", "║")}${fitText(` ${content}`, width)}${this.theme.fg("borderMuted", "║")}`;
  }

  private brandLine(): string {
    return `${this.theme.bold(this.theme.fg("accent", SHELLOCK_MARK))} ${this.theme.fg("muted", `v${this.version}`)}`;
  }

  private keyValueLine(label: string, value: string, width: number): string {
    const labelWidth = Math.min(9, Math.max(5, Math.floor(width * 0.22)));
    const key = label.padEnd(labelWidth, " ");
    return `${this.theme.fg("dim", key)} ${this.theme.fg("muted", value)}`;
  }

  private primaryAction(): string {
    return this.status.hasMission
      ? "/shellock <task> to continue the case"
      : "/shellock-init <authorized mission>";
  }

  private caseState(): string {
    return this.status.hasMission
      ? `${this.theme.fg("success", "●")} ${this.theme.fg("success", "case ready")}`
      : `${this.theme.fg("warning", "○")} ${this.theme.fg("muted", "no active case")}`;
  }

  private caseStateText(): string {
    if (!this.status.hasMission) return "no active case";
    return "authorized case ready";
  }

}

type FooterData = {
  getGitBranch(): string | null;
  onBranchChange(callback: () => void): () => void;
};

class ShellockFooter {
  private readonly unsubscribe: () => void;

  constructor(
    tui: TUI,
    private readonly ctx: ExtensionContext,
    private readonly status: CaseFileStatus,
    private readonly theme: ExtensionContext["ui"]["theme"],
    private readonly footerData: FooterData,
  ) {
    this.unsubscribe = footerData.onBranchChange(() => tui.requestRender());
  }

  invalidate(): void {}

  dispose(): void {
    this.unsubscribe();
  }

  render(width: number): string[] {
    const branch = this.footerData.getGitBranch();
    const location = branch ? `${branch}  ${compactCwd(this.ctx.cwd)}` : compactCwd(this.ctx.cwd);
    const caseText = this.status.hasMission
      ? `case ready  ·  ${this.status.findingCount} findings  ·  ${shortRuntimeStatus()}`
      : `case none  ·  ${shortRuntimeStatus()}`;

    if (width < 56) {
      return [
        fitText(this.theme.fg("dim", location), width),
        fitText(this.theme.fg("muted", caseText), width),
        fitText(this.theme.fg("dim", modelValue(this.ctx)), width),
      ];
    }

    return [
      alignColumns(this.theme.fg("dim", location), this.theme.fg("dim", contextValue(this.ctx)), width),
      alignColumns(this.theme.fg("muted", caseText), this.theme.fg("dim", modelValue(this.ctx)), width),
    ];
  }
}

class ShellockEditor extends CustomEditor {
  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
    super(tui, theme, keybindings, { paddingX: 1 });
  }

  override render(width: number): string[] {
    if (width < 8) return super.render(width);

    const contentWidth = width - 4;
    const rendered = super.render(contentWidth);
    rendered.shift();
    const lowerBorder = rendered.findIndex((line) => /^─+(?:\s*[↑↓].*)?$/.test(stripAnsi(line)));
    if (lowerBorder >= 0) rendered.splice(lowerBorder, 1);

    const horizontal = this.borderColor("─");
    return [
      `${this.borderColor("╭")}${horizontal.repeat(width - 2)}${this.borderColor("╮")}`,
      ...rendered.map((line) => `${this.borderColor("│")} ${fitText(line, contentWidth)} ${this.borderColor("│")}`),
      `${this.borderColor("╰")}${horizontal.repeat(width - 2)}${this.borderColor("╯")}`,
    ];
  }
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

function alignColumns(left: string, right: string, width: number): string {
  const availableLeft = Math.max(0, width - visibleWidth(right) - 2);
  const clippedLeft = visibleWidth(left) > availableLeft ? truncateToWidth(left, availableLeft, "") : left;
  const gap = " ".repeat(Math.max(2, width - visibleWidth(clippedLeft) - visibleWidth(right)));
  return `${clippedLeft}${gap}${right}`;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function compactCwd(cwd: string): string {
  const home = process.env.HOME;
  return home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 10_000) return `${Math.round(tokens / 1_000)}k`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

function modelValue(ctx: ExtensionContext): string {
  if (!ctx.model) return "no model";
  return `${ctx.model.provider}/${ctx.model.name ?? ctx.model.id}`;
}

function contextValue(ctx: ExtensionContext): string {
  const usage = ctx.getContextUsage();
  const window = usage?.contextWindow ?? ctx.model?.contextWindow;
  if (!window) return "context unknown";
  return `${formatTokens(usage?.tokens ?? 0)} / ${formatTokens(window)}`;
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
  if (!status.hasMission) return "shellock:pack";

  return `shellock:case h${status.hypothesisCount} f${status.findingCount} r${status.runCount}`;
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
