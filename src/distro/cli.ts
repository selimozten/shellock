#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import {
  BEDROCK_MANTLE_PROVIDER,
  bedrockMantleProviderConfig,
} from "../pi/extensions/bedrock-mantle.js";
import incusBashExtension from "../pi/extensions/incus-bash.js";
import shellockExtension from "../pi/extensions/shellock.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "../..");
const PI_CORE_VERSION = readPiCoreVersion();
const SHELLOCK_AGENT_ENV = "SHELLOCK_CODING_AGENT_DIR";
const SHELLOCK_CONFIG_VERSION = 3;
const SHELLOCK_THEME_SETTING = "shellock-light/shellock-dark";
const SHELLOCK_THEME_FILES = ["shellock-dark.json", "shellock-light.json"];
const LEGACY_COPIED_PACKAGES = ["npm:pi-mcp-adapter"];
const BEDROCK_MANTLE_MODEL_IDS = new Set(["openai.gpt-5.4", "openai.gpt-5.5"]);
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
  process.env.PI_SKIP_VERSION_CHECK = "1";

  const piCoreMainPath = join(PACKAGE_ROOT, "dist", "pi-core", "dist", "main.js");
  const { main } = (await import(pathToFileURL(piCoreMainPath).href)) as { main: PiMain };
  await main(args, {
    extensionFactories: [shellockExtension, incusBashExtension],
  });
}

async function ensureShellockAgentConfig(): Promise<void> {
  const shellockAgentDir = process.env[SHELLOCK_AGENT_ENV] ?? join(homedir(), ".shellock", "agent");
  process.env[SHELLOCK_AGENT_ENV] = shellockAgentDir;

  await mkdir(shellockAgentDir, { recursive: true });

  await seedBundledThemes(shellockAgentDir);
  await seedShellockModels(shellockAgentDir);
  await seedSettings(shellockAgentDir);
}

async function seedShellockModels(shellockAgentDir: string): Promise<void> {
  const targetPath = join(shellockAgentDir, "models.json");
  const target = existsSync(targetPath) ? await readJsonRecord(targetPath) : {};
  const providers = asRecord(target.providers);
  providers[BEDROCK_MANTLE_PROVIDER] = bedrockMantleProviderConfig();
  target.providers = providers;
  await writeJson(targetPath, target);
}

async function seedBundledThemes(shellockAgentDir: string): Promise<void> {
  const targetDir = join(shellockAgentDir, "themes");
  await mkdir(targetDir, { recursive: true });

  await Promise.all(
    SHELLOCK_THEME_FILES.map(async (file) => {
      const source = await readFile(join(PACKAGE_ROOT, "resources", "themes", file), "utf8");
      await writeFile(join(targetDir, file), source, "utf8");
    }),
  );
}

async function seedSettings(shellockAgentDir: string): Promise<void> {
  const targetPath = join(shellockAgentDir, "settings.json");

  if (!existsSync(targetPath)) {
    const settings = {
      shellockConfigVersion: SHELLOCK_CONFIG_VERSION,
      defaultThinkingLevel: "high",
      packages: [],
      theme: SHELLOCK_THEME_SETTING,
      defaultProjectTrust: "ask",
      quietStartup: true,
      collapseChangelog: true,
      lastChangelogVersion: PI_CORE_VERSION,
      showHardwareCursor: true,
      hideThinkingBlock: false,
      enableInstallTelemetry: false,
    };
    await writeJson(targetPath, settings);
    return;
  }

  const target = await readJsonRecord(targetPath);
  migrateLegacyShellockSettings(target);
  target.lastChangelogVersion = PI_CORE_VERSION;
  if (target.hideThinkingBlock === undefined) target.hideThinkingBlock = false;
  if (isShellockForcedDefault(target)) {
    delete target.defaultProvider;
    delete target.defaultModel;
  }

  const enabledModels = removeShellockManagedModelRefs(asStringArray(target.enabledModels));
  if (enabledModels.length > 0) {
    target.enabledModels = enabledModels;
  } else {
    delete target.enabledModels;
  }
  await writeJson(targetPath, target);
}

function migrateLegacyShellockSettings(settings: Record<string, unknown>): void {
  const version = typeof settings.shellockConfigVersion === "number" ? settings.shellockConfigVersion : 0;
  if (version >= SHELLOCK_CONFIG_VERSION) return;

  if (version < 1) {
    const packages = asStringArray(settings.packages);
    const inheritedPackageState =
      packages.length === LEGACY_COPIED_PACKAGES.length &&
      packages.every((entry, index) => entry === LEGACY_COPIED_PACKAGES[index]);

    if (inheritedPackageState) {
      settings.packages = [];
      if (settings.enableInstallTelemetry === true) settings.enableInstallTelemetry = false;
    }
  }

  if (version < 2) {
    const defaultModel = typeof settings.defaultModel === "string" ? settings.defaultModel : undefined;
    if (settings.defaultProvider === "amazon-bedrock" && defaultModel && BEDROCK_MANTLE_MODEL_IDS.has(defaultModel)) {
      settings.defaultProvider = BEDROCK_MANTLE_PROVIDER;
    }

    const enabledModels = asStringArray(settings.enabledModels).map((entry) => {
      const [provider, ...modelParts] = entry.split("/");
      const model = modelParts.join("/");
      return provider === "amazon-bedrock" && BEDROCK_MANTLE_MODEL_IDS.has(model)
        ? `${BEDROCK_MANTLE_PROVIDER}/${model}`
        : entry;
    });
    if (enabledModels.length > 0) settings.enabledModels = unique(enabledModels);
  }

  if (version < 3) {
    const enabledModels = removeShellockManagedModelRefs(asStringArray(settings.enabledModels));
    if (enabledModels.length > 0) {
      settings.enabledModels = enabledModels;
    } else {
      delete settings.enabledModels;
    }
  }

  settings.shellockConfigVersion = SHELLOCK_CONFIG_VERSION;
}

function isShellockForcedDefault(settings: Record<string, unknown>): boolean {
  return SHELLOCK_FORCED_MODEL_DEFAULTS.some(
    (entry) =>
      lowercase(settings.defaultProvider) === entry.provider.toLowerCase() &&
      lowercase(settings.defaultModel) === entry.model.toLowerCase(),
  );
}

function removeShellockManagedModelRefs(models: string[]): string[] {
  const managedRefs = new Set([
    ...SHELLOCK_FORCED_MODEL_DEFAULTS.map((entry) => entry.ref.toLowerCase()),
    ...Array.from(BEDROCK_MANTLE_MODEL_IDS, (model) => `${BEDROCK_MANTLE_PROVIDER}/${model}`.toLowerCase()),
  ]);
  return unique(models.filter((entry) => !managedRefs.has(entry.toLowerCase())));
}

function lowercase(value: unknown): string | undefined {
  return typeof value === "string" ? value.toLowerCase() : undefined;
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

function readPiCoreVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "dist", "pi-core", "package.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
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
  /skills                      Browse and invoke specialized workflows
  /shellock-runtime            Inspect or manage an isolated runtime
  /shellock-doctor             Check config, runtime, and available tools

Shellock does not copy credentials from Pi automatically. Use /login inside
Shellock or provider environment variables such as ANTHROPIC_API_KEY,
OPENAI_API_KEY, or TOGETHER_API_KEY.

Amazon Bedrock GPT-5.4/5.5 use AWS_BEARER_TOKEN_BEDROCK and AWS_REGION
through Shellock's amazon-bedrock-mantle provider.

All other Pi options are still passed through during normal runs.`);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
