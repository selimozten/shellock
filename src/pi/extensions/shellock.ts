import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { buildAssessmentPrompt } from "../../agent/prompt-pack.js";
import { formatDoctorReport, runDoctor } from "../../doctor/doctor.js";
import { runRuntimeCommand } from "../../runtime/commands.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PACKAGE_VERSION = readPackageVersion();
const HEADER_MAX_WIDTH = 104;
const HEADER_TWO_COLUMN_MIN_WIDTH = 86;
const SHELLOCK_MARK = "shellock";
const SHELLOCK_WORDMARK = [
  "       __       ____         __  ",
  "  ___ / /  ___ / / /__  ____/ /__",
  " (_-</ _ \\/ -_) / / _ \\/ __/  '_/",
  "/___/_//_/\\__/_/_/\\___/\\__/_/\\_\\ ",
];
export default function shellockExtension(pi: ExtensionAPI) {
  pi.on("resources_discover", () => ({
    skillPaths: [join(PACKAGE_ROOT, "resources", "skills")],
  }));

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n## Shellock Pack\n\n${buildAssessmentPrompt()}`,
  }));

  pi.on("session_start", async (_event, ctx) => {
    applyTerminalBranding(ctx);
  });

  pi.registerCommand("shellock-runtime", {
    description: "Inspect and manage Shellock runtime sessions",
    handler: async (args, ctx) => {
      try {
        const output = await runRuntimeCommand(args, {
          cwd: ctx.cwd,
          runtimeStatus,
        });
        applyTerminalBranding(ctx);
        ctx.ui.notify(output, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerCommand("shellock-doctor", {
    description: "Check Shellock config, runtime, and security tool profile",
    handler: async (_args, ctx) => {
      const report = await runDoctor({ workspaceRoot: ctx.cwd });
      ctx.ui.notify(formatDoctorReport(report), report.checks.some((check) => check.status === "fail") ? "error" : "info");
    },
  });

}

function applyTerminalBranding(ctx: ExtensionContext): void {
  ctx.ui.setStatus("shellock", ctx.ui.theme.fg("muted", `shellock · ${shortRuntimeStatus()}`));

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
  ctx.ui.setHeader((_tui, theme) => new ShellockHeader(ctx, PACKAGE_VERSION, theme));
  ctx.ui.setFooter((tui, theme, footerData) => new ShellockFooter(tui, ctx, theme, footerData));
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new ShellockEditor(tui, theme, keybindings, ctx));
}

class ShellockHeader {
  constructor(
    private readonly ctx: ExtensionContext,
    private readonly version: string,
    private readonly theme: ExtensionContext["ui"]["theme"],
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    if (width < 52) return this.renderCompact(width);

    const boxWidth = Math.min(width - 2, HEADER_MAX_WIDTH);
    const innerWidth = boxWidth - 2;
    const boxLines = innerWidth < HEADER_TWO_COLUMN_MIN_WIDTH ? this.renderSingleColumn(boxWidth) : this.renderTwoColumn(boxWidth);
    const leftPadding = " ".repeat(Math.max(0, Math.floor((width - boxWidth) / 2)));
    return boxLines.map((line) => `${leftPadding}${line}`);
  }

  private renderTwoColumn(boxWidth: number): string[] {
    const innerWidth = boxWidth - 2;
    const leftWidth = 38;
    const rightWidth = innerWidth - leftWidth - 4;
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
      fitText(`${theme.fg("dim", "security research harness")} ${theme.fg("borderMuted", "·")} ${theme.fg("muted", shortRuntimeStatus())}`, width),
    ];
  }

  private renderSingleColumn(boxWidth: number): string[] {
    const innerWidth = boxWidth - 2;
    const rows = [
      `${this.theme.fg("success", "●")} ${this.theme.bold(this.theme.fg("accent", "security research harness"))}`,
      this.keyValueLine("workspace", compactCwd(this.ctx.cwd), innerWidth),
      this.keyValueLine("model", modelValue(this.ctx), innerWidth),
      this.keyValueLine("runtime", shortRuntimeStatus(), innerWidth),
    ];

    return [this.topBorder(boxWidth), ...rows.map((row) => this.row(row, innerWidth)), this.bottomBorder(boxWidth)];
  }

  private leftPanel(width: number): string[] {
    const theme = this.theme;
    return SHELLOCK_WORDMARK.map((line) => centerText(theme.fg("muted", line), width));
  }

  private rightPanel(width: number): string[] {
    return [
      `${this.theme.fg("success", "●")} ${this.theme.bold(this.theme.fg("accent", "security research harness"))}`,
      this.keyValueLine("workspace", compactCwd(this.ctx.cwd), width),
      this.keyValueLine("model", modelValue(this.ctx), width),
      this.keyValueLine("runtime", shortRuntimeStatus(), width),
    ];
  }

  private topBorder(width: number): string {
    const prefix = this.theme.fg("borderMuted", "╔═");
    const title = this.theme.bold(this.theme.fg("accent", ` ${SHELLOCK_MARK} `));
    const version = this.theme.fg("dim", `v${this.version} `);
    const fillWidth = Math.max(0, width - visibleWidth(prefix) - visibleWidth(title) - visibleWidth(version) - 1);
    return `${prefix}${title}${version}${this.theme.fg("borderMuted", `${"═".repeat(fillWidth)}╗`)}`;
  }

  private bottomBorder(width: number): string {
    return this.theme.fg("borderMuted", `╚${"═".repeat(Math.max(0, width - 2))}╝`);
  }

  private splitRow(left: string, leftWidth: number, right: string, rightWidth: number): string {
    const theme = this.theme;
    return [
      theme.fg("borderMuted", "║"),
      fitText(` ${left}`, leftWidth),
      " ".repeat(4),
      fitText(` ${right}`, rightWidth),
      theme.fg("borderMuted", "║"),
    ].join("");
  }

  private row(content: string, width: number): string {
    return `${this.theme.fg("borderMuted", "║")}${fitText(` ${content}`, width)}${this.theme.fg("borderMuted", "║")}`;
  }

  private keyValueLine(label: string, value: string, width: number): string {
    const labelWidth = Math.min(10, Math.max(7, Math.floor(width * 0.2)));
    const key = label.padEnd(labelWidth, " ");
    return `${this.theme.fg("dim", key)} ${this.theme.fg("muted", value)}`;
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
    const runtime = shortRuntimeStatus();

    if (width < 56) {
      return [
        fitText(this.theme.fg("dim", location), width),
        alignColumns(this.theme.fg("muted", runtime), this.theme.fg("dim", contextValue(this.ctx)), width),
      ];
    }

    return [
      alignColumns(
        this.theme.fg("dim", location),
        this.theme.fg("dim", `${runtime} · ${contextValue(this.ctx)}`),
        width,
      ),
    ];
  }
}

class ShellockEditor extends CustomEditor {
  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly ctx: ExtensionContext,
  ) {
    super(tui, theme, keybindings, { paddingX: 1 });
  }

  override render(width: number): string[] {
    if (width < 8) return super.render(width);

    const contentWidth = width - 4;
    const rendered = super.render(Math.max(1, contentWidth - 2));
    rendered.shift();
    const lowerBorder = rendered.findIndex((line) => /^─+(?:\s*[↑↓].*)?$/.test(stripAnsi(line)));
    if (lowerBorder >= 0) rendered.splice(lowerBorder, 1);

    const horizontal = this.borderColor("─");
    return [
      `${this.borderColor("╭")}${horizontal.repeat(width - 2)}${this.borderColor("╮")}`,
      ...rendered.map((line, index) => {
        const prefix = index === 0 ? `${this.borderColor("›")} ` : "  ";
        return `${this.borderColor("│")} ${fitText(`${prefix}${line}`, contentWidth)} ${this.borderColor("│")}`;
      }),
      this.bottomBorder(width, horizontal),
    ];
  }

  private bottomBorder(width: number, horizontal: string): string {
    if (width < 24 || !this.ctx.model) {
      return `${this.borderColor("╰")}${horizontal.repeat(width - 2)}${this.borderColor("╯")}`;
    }

    const maxModelWidth = Math.min(48, Math.max(12, Math.floor(width * 0.4)));
    const model = truncateToWidth(this.ctx.model.name ?? this.ctx.model.id, maxModelWidth, "");
    const label = ` ${model} `;
    const fillWidth = Math.max(0, width - visibleWidth(label) - 2);
    return `${this.borderColor("╰")}${horizontal.repeat(fillWidth)}${this.borderColor(label)}${this.borderColor("╯")}`;
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
  const clippedRight = visibleWidth(right) > width ? truncateToWidth(right, width, "") : right;
  const availableLeft = Math.max(0, width - visibleWidth(clippedRight) - 2);
  const clippedLeft = visibleWidth(left) > availableLeft ? truncateToWidth(left, availableLeft, "") : left;
  const gap = " ".repeat(Math.max(0, width - visibleWidth(clippedLeft) - visibleWidth(clippedRight)));
  return `${clippedLeft}${gap}${clippedRight}`;
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

function shortRuntimeStatus(): string {
  const status = runtimeStatus();
  return status === "local Pi bash" ? "local bash" : status;
}

function runtimeStatus(): string {
  const instance = process.env.SHELLOCK_INCUS_INSTANCE;
  if (!instance) return "local Pi bash";

  const guestWorkspace = process.env.SHELLOCK_WORKSPACE_GUEST ?? "/workspace";
  return `Incus ${instance} mounted at ${guestWorkspace}`;
}
