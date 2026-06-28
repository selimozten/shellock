#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import incusBashExtension from "../pi/extensions/incus-bash.js";
import shellockExtension from "../pi/extensions/shellock.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "../..");
const SHELLOCK_AGENT_ENV = "SHELLOCK_CODING_AGENT_DIR";
const SHELLOCK_THEME_SETTING = "shellock-light/shellock-dark";
const SHELLOCK_THEME_FILES = ["shellock-dark.json", "shellock-light.json"];
const SHELLOCK_FORCED_MODEL_DEFAULTS = [
  { provider: "zai", model: "glm-5.2", ref: "zai/glm-5.2" },
  { provider: "together", model: "zai-org/glm-5.2", ref: "together/zai-org/glm-5.2" },
];

type PiMain = (
  args: string[],
  options?: {
    extensionFactories?: ExtensionFactory[];
  },
) => Promise<void>;

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  if (isVersionRequest(args)) {
    console.log(await packageVersion());
    return;
  }
  if (isHelpRequest(args)) {
    printShellockHelp();
    return;
  }

  await ensureShellockAgentConfig();

  process.title = "shellock";
  process.env.PI_CODING_AGENT = "true";

  const piCoreMainPath = join(PACKAGE_ROOT, "dist", "pi-core", "dist", "main.js");
  const { main } = (await import(pathToFileURL(piCoreMainPath).href)) as { main: PiMain };
  await main(args, {
    extensionFactories: [shellockExtension, incusBashExtension],
  });
}

async function ensureShellockAgentConfig(): Promise<void> {
  const shellockAgentDir = process.env[SHELLOCK_AGENT_ENV] ?? join(homedir(), ".shellock", "agent");
  process.env[SHELLOCK_AGENT_ENV] = shellockAgentDir;

  const piAgentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  await mkdir(shellockAgentDir, { recursive: true });

  await seedBundledThemes(shellockAgentDir);
  await seedSettings(piAgentDir, shellockAgentDir);
}

async function seedBundledThemes(shellockAgentDir: string): Promise<void> {
  const targetDir = join(shellockAgentDir, "themes");
  await mkdir(targetDir, { recursive: true });

  await Promise.all(
    SHELLOCK_THEME_FILES.map(async (file) => {
      const source = await readFile(join(PACKAGE_ROOT, "themes", file), "utf8");
      await writeFile(join(targetDir, file), source, "utf8");
    }),
  );
}

async function seedSettings(piAgentDir: string, shellockAgentDir: string): Promise<void> {
  const sourcePath = join(piAgentDir, "settings.json");
  const targetPath = join(shellockAgentDir, "settings.json");
  const source = existsSync(sourcePath) ? await readJsonRecord(sourcePath) : {};

  if (!existsSync(targetPath)) {
    const settings = {
      defaultThinkingLevel: typeof source.defaultThinkingLevel === "string" ? source.defaultThinkingLevel : "high",
      packages: filterShellockPackageRefs(asStringArray(source.packages), piAgentDir),
      theme: SHELLOCK_THEME_SETTING,
      defaultProjectTrust: typeof source.defaultProjectTrust === "string" ? source.defaultProjectTrust : "ask",
      quietStartup: source.quietStartup ?? true,
      collapseChangelog: source.collapseChangelog ?? true,
      showHardwareCursor: source.showHardwareCursor ?? true,
      hideThinkingBlock: source.hideThinkingBlock ?? true,
      compaction: source.compaction,
      retry: source.retry,
      transport: source.transport,
      enableInstallTelemetry: source.enableInstallTelemetry ?? false,
    };
    await writeJson(targetPath, stripUndefined(settings));
    return;
  }

  const target = await readJsonRecord(targetPath);
  if (target.hideThinkingBlock === undefined) target.hideThinkingBlock = true;
  if (isShellockForcedDefault(target)) {
    delete target.defaultProvider;
    delete target.defaultModel;
  }

  const enabledModels = removeShellockForcedDefaultRefs(asStringArray(target.enabledModels));
  if (enabledModels.length > 0) {
    target.enabledModels = enabledModels;
  } else {
    delete target.enabledModels;
  }
  await writeJson(targetPath, target);
}

function isShellockForcedDefault(settings: Record<string, unknown>): boolean {
  return SHELLOCK_FORCED_MODEL_DEFAULTS.some(
    (entry) =>
      lowercase(settings.defaultProvider) === entry.provider.toLowerCase() &&
      lowercase(settings.defaultModel) === entry.model.toLowerCase(),
  );
}

function removeShellockForcedDefaultRefs(models: string[]): string[] {
  const legacyRefs = new Set(SHELLOCK_FORCED_MODEL_DEFAULTS.map((entry) => entry.ref.toLowerCase()));
  return unique(models.filter((entry) => !legacyRefs.has(entry.toLowerCase())));
}

function lowercase(value: unknown): string | undefined {
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

function filterShellockPackageRefs(packages: string[], piAgentDir: string): string[] {
  return packages.filter((entry) => {
    if (entry.startsWith("npm:") || entry.startsWith("git:") || entry.startsWith("http:") || entry.startsWith("https:")) {
      return true;
    }

    try {
      return resolve(piAgentDir, entry) !== PACKAGE_ROOT;
    } catch {
      return true;
    }
  });
}

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  return asRecord(value);
}

async function writeJson(path: string, value: Record<string, unknown>): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isHelpRequest(args: string[]): boolean {
  return args.length === 0 ? false : args.includes("--help") || args.includes("-h");
}

function isVersionRequest(args: string[]): boolean {
  return args.includes("--version") || args.includes("-v");
}

async function packageVersion(): Promise<string> {
  const pkg = await readJsonRecord(join(PACKAGE_ROOT, "package.json"));
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

function printShellockHelp(): void {
  console.log(`shellock - Pi-family security operations agent harness

Usage:
  shellock [options] [messages...]

Common options:
  --model <provider/model>     Use a specific Pi-supported model for this run
  --provider <name>            Use a specific provider
  --api-key <key>              Runtime API key override, handled by Pi
  --no-session                 Do not save this session
  --approve                    Trust project-local Pi context for this run
  --offline                    Disable startup network operations
  --help, -h                   Show this help
  --version, -v                Show Shellock version

Inside Shellock:
  /login                       Use Pi-supported subscription or API-key login
  /model                       Switch models
  /shellock-init <mission>     Create an authorized security case file
  /shellock <task>             Continue mission work from the case file
  /shellock-status             Show case-file/runtime status
  /shellock-doctor             Check config, case file, runtime, and tools

Shellock does not copy credentials from Pi automatically. Use /login inside
Shellock or provider environment variables such as ANTHROPIC_API_KEY,
OPENAI_API_KEY, or TOGETHER_API_KEY.

All other Pi options are still passed through during normal runs.`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
