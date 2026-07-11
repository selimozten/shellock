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
const HEADER_MAX_WIDTH = 72;
const SHELLOCK_MARK = "shellock";
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
  ctx.ui.setEditorComponent((tui, theme, keybindings) => new ShellockEditor(tui, theme, keybindings));
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
    const boxLines = [
      this.topBorder(boxWidth),
      this.row(this.keyValueLine("workspace", compactCwd(this.ctx.cwd), innerWidth, true), innerWidth),
      this.row(this.keyValueLine("model", modelValue(this.ctx), innerWidth), innerWidth),
      this.bottomBorder(boxWidth),
    ];
    const leftPadding = " ".repeat(Math.max(0, Math.floor((width - boxWidth) / 2)));
    return boxLines.map((line) => `${leftPadding}${line}`);
  }

  private renderCompact(width: number): string[] {
    const theme = this.theme;
    return [
      fitText(`${theme.bold(theme.fg("accent", SHELLOCK_MARK))} ${theme.fg("muted", `v${this.version}`)}`, width),
      fitText(theme.fg("dim", modelValue(this.ctx)), width),
    ];
  }

  private topBorder(width: number): string {
    const prefix = this.theme.fg("borderMuted", "╭─");
    const title = this.theme.bold(this.theme.fg("accent", ` ${SHELLOCK_MARK} `));
    const version = this.theme.fg("dim", `v${this.version} `);
    const fillWidth = Math.max(0, width - visibleWidth(prefix) - visibleWidth(title) - visibleWidth(version) - 1);
    return `${prefix}${title}${version}${this.theme.fg("borderMuted", `${"─".repeat(fillWidth)}╮`)}`;
  }

  private bottomBorder(width: number): string {
    return this.theme.fg("borderMuted", `╰${"─".repeat(Math.max(0, width - 2))}╯`);
  }

  private row(content: string, width: number): string {
    return `${this.theme.fg("borderMuted", "│")}${fitText(` ${content}`, width)}${this.theme.fg("borderMuted", "│")}`;
  }

  private keyValueLine(label: string, value: string, width: number, isPath = false): string {
    const labelWidth = 10;
    const valueWidth = Math.max(1, width - labelWidth - 2);
    const key = label.padEnd(labelWidth, " ");
    const displayValue = isPath ? truncatePath(value, valueWidth) : truncateText(value, valueWidth);
    return `${this.theme.fg("dim", key)} ${this.theme.fg("muted", displayValue)}`;
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
    const runtime = shortRuntimeStatus();
    const context = contextValue(this.ctx);
    const model = modelValue(this.ctx);

    if (width < 80) {
      return [
        fitText(this.formatLocation(branch, width), width),
        alignColumns(
          this.theme.fg("dim", truncateText(model, Math.max(12, Math.floor(width * 0.58)))),
          this.theme.fg("dim", `${runtime} · ${context}`),
          width,
        ),
      ];
    }

    const rightText = truncateText(`${model} · ${runtime} · ${context}`, Math.floor(width * 0.65));
    const right = this.theme.fg("dim", rightText);
    const leftWidth = Math.max(0, width - visibleWidth(right) - 2);
    return [
      alignColumns(this.formatLocation(branch, leftWidth), right, width),
    ];
  }

  private formatLocation(branch: string | null, width: number): string {
    if (width <= 0) return "";

    const separator = branch ? " · " : "";
    const branchWidth = branch ? Math.min(visibleWidth(branch), Math.max(0, width - visibleWidth(separator) - 1)) : 0;
    const displayBranch = branch ? truncateText(branch, branchWidth) : "";
    const pathWidth = Math.max(0, width - visibleWidth(displayBranch) - visibleWidth(separator));
    const path = truncatePath(compactCwd(this.ctx.cwd), pathWidth);

    return branch
      ? `${this.theme.fg("muted", displayBranch)}${this.theme.fg("borderMuted", separator)}${this.theme.fg("dim", path)}`
      : this.theme.fg("dim", path);
  }
}

class ShellockEditor extends CustomEditor {
  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
    super(tui, theme, keybindings, { paddingX: 1 });
  }

  override render(width: number): string[] {
    if (width < 8) return super.render(width);

    const contentWidth = width - 4;
    const rendered = super.render(Math.max(1, contentWidth - 2));
    const upperBorder = rendered.shift() ?? "";
    const lowerBorder = rendered.findIndex((line) => /^─+(?:\s*[↑↓].*)?$/.test(stripAnsi(line)));
    const lowerBorderContent = lowerBorder >= 0 ? rendered.splice(lowerBorder, 1)[0] ?? "" : "";

    const horizontal = this.borderColor("─");
    return [
      this.framedBorder("╭", upperBorder, "╮", width, horizontal),
      ...rendered.map((line, index) => {
        const prefix = index === 0 ? `${this.borderColor("›")} ` : "  ";
        return `${this.borderColor("│")} ${fitText(`${prefix}${line}`, contentWidth)} ${this.borderColor("│")}`;
      }),
      this.framedBorder("╰", lowerBorderContent, "╯", width, horizontal),
    ];
  }

  private framedBorder(left: string, content: string, right: string, width: number, horizontal: string): string {
    const targetWidth = Math.max(0, width - 2);
    const clipped = visibleWidth(content) > targetWidth ? truncateToWidth(content, targetWidth, "…") : content;
    const fill = horizontal.repeat(Math.max(0, targetWidth - visibleWidth(clipped)));
    return `${this.borderColor(left)}${clipped}${fill}${this.borderColor(right)}`;
  }
}

function fitText(text: string, width: number): string {
  if (width <= 0) return "";
  const clipped = visibleWidth(text) > width ? truncateToWidth(text, width, "…") : text;
  return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}

function alignColumns(left: string, right: string, width: number): string {
  const clippedRight = visibleWidth(right) > width ? truncateToWidth(right, width, "…") : right;
  const availableLeft = Math.max(0, width - visibleWidth(clippedRight) - 2);
  const clippedLeft = visibleWidth(left) > availableLeft ? truncateToWidth(left, availableLeft, "…") : left;
  const gap = " ".repeat(Math.max(0, width - visibleWidth(clippedLeft) - visibleWidth(clippedRight)));
  return `${clippedLeft}${gap}${clippedRight}`;
}

function truncateText(text: string, width: number): string {
  if (width <= 0) return "";
  return visibleWidth(text) > width ? truncateToWidth(text, width, "…") : text;
}

function truncatePath(path: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(path) <= width) return path;

  const segments = path.split("/").filter(Boolean);
  const tail = segments.at(-1) ?? path;
  const prefix = path.startsWith("~/") ? "~/" : path.startsWith("/") ? "/" : "";
  const segmented = `${prefix}…/${tail}`;
  if (visibleWidth(segmented) <= width) return segmented;
  if (width === 1) return "…";
  return `…${path.slice(-(width - 1))}`;
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
