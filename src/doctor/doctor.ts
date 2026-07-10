import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BUNDLED_RUNTIME_PROFILES, parseRuntimeProfile, toolGroupsForProfile } from "../runtime/tooling.js";

const execFileAsync = promisify(execFile);
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  status: DoctorStatus;
  name: string;
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
}

export async function runDoctor(options: { workspaceRoot?: string } = {}): Promise<DoctorReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion());
  checks.push(...await checkPackageAssets());
  checks.push(...await checkAgentConfig());
  checks.push(...await checkRuntime(workspaceRoot));
  checks.push(...await checkToolProfile());

  return { checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const passed = report.checks.filter((check) => check.status === "pass").length;
  const warnings = report.checks.filter((check) => check.status === "warn").length;
  const failures = report.checks.filter((check) => check.status === "fail").length;
  const lines = ["Shellock doctor", "===============", ""];

  for (const check of report.checks) {
    lines.push(`${label(check.status)} ${check.name}: ${check.detail}`);
    if (check.hint) lines.push(`    hint: ${check.hint}`);
  }

  lines.push("", `Summary: ${failures} failure(s), ${warnings} warning(s), ${passed} passed.`);
  return lines.join("\n");
}

function checkNodeVersion(): DoctorCheck {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= 22) {
    return { status: "pass", name: "node", detail: `Node ${process.versions.node}` };
  }
  return {
    status: "fail",
    name: "node",
    detail: `Node ${process.versions.node}; Shellock requires Node 22+`,
    hint: "Install a current Node.js runtime before running Shellock.",
  };
}

async function checkPackageAssets(): Promise<DoctorCheck[]> {
  const required = [
    ["skills", join(PACKAGE_ROOT, "resources", "skills")],
    ["incus image", join(PACKAGE_ROOT, "images", "incus", "shellock.yaml")],
    ...BUNDLED_RUNTIME_PROFILES.map((profile) => [`incus ${profile} profile`, join(PACKAGE_ROOT, "profiles", "incus", `${profile}.yaml`)] as const),
  ] as const;

  return Promise.all(
    required.map(async ([name, path]) => {
      if (await pathExists(path)) {
        return { status: "pass", name: `asset:${name}`, detail: path } satisfies DoctorCheck;
      }
      return {
        status: "fail",
        name: `asset:${name}`,
        detail: `missing ${path}`,
        hint: "Run npm run build from the Shellock source tree.",
      } satisfies DoctorCheck;
    }),
  );
}

async function checkAgentConfig(): Promise<DoctorCheck[]> {
  const agentDir = process.env.SHELLOCK_CODING_AGENT_DIR ?? join(homedir(), ".shellock", "agent");
  const settingsPath = join(agentDir, "settings.json");
  const authPath = join(agentDir, "auth.json");
  const modelsPath = join(agentDir, "models.json");
  const checks: DoctorCheck[] = [];

  checks.push(
    existsSync(settingsPath)
      ? { status: "pass", name: "agent settings", detail: settingsPath }
      : {
          status: "warn",
          name: "agent settings",
          detail: `missing ${settingsPath}`,
          hint: "Run shellock once so it can create ~/.shellock/agent/settings.json.",
        },
  );

  const settings = existsSync(settingsPath) ? await readJsonRecord(settingsPath) : {};
  const models = existsSync(modelsPath) ? await readJsonRecord(modelsPath) : {};
  const providers = asRecord(models.providers);
  const providerNames = Object.keys(providers).sort();
  checks.push(
    providerNames.length > 0
      ? { status: "pass", name: "custom model providers", detail: providerNames.join(", ") }
      : {
          status: "pass",
          name: "custom model providers",
          detail: "none; Shellock can still use Pi built-in providers via /login or API keys",
        },
  );

  const auth = existsSync(authPath) ? await readJsonRecord(authPath) : {};
  const authProviders = Object.keys(auth).sort();
  const envProviders = configuredEnvProviders();
  const configuredProviders = Array.from(new Set([...authProviders, ...envProviders])).sort();
  checks.push(
    configuredProviders.length > 0
      ? { status: "pass", name: "model auth", detail: configuredProviders.join(", ") }
      : {
          status: "warn",
          name: "model auth",
          detail: "no subscription login, OAuth token, or API key detected for Shellock",
          hint: "Run /login in Shellock, or provide an API key such as ANTHROPIC_API_KEY, OPENAI_API_KEY, or TOGETHER_API_KEY. Shellock does not copy Pi credentials automatically.",
        },
  );

  const defaultProvider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : undefined;
  const defaultModel = typeof settings.defaultModel === "string" ? settings.defaultModel : undefined;
  if (defaultProvider || defaultModel) {
    checks.push({
      status: "pass",
      name: "default model",
      detail: [defaultProvider, defaultModel].filter(Boolean).join("/") || "configured",
    });
  }

  return checks;
}

function configuredEnvProviders(): string[] {
  const providers: Array<[string, string[]]> = [
    ["anthropic", ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN"]],
    ["openai", ["OPENAI_API_KEY"]],
    ["azure-openai", ["AZURE_OPENAI_API_KEY"]],
    ["google", ["GEMINI_API_KEY", "GOOGLE_API_KEY"]],
    ["together", ["TOGETHER_API_KEY"]],
    ["openrouter", ["OPENROUTER_API_KEY"]],
    ["github-copilot", ["GITHUB_TOKEN"]],
    ["mistral", ["MISTRAL_API_KEY"]],
    ["xai", ["XAI_API_KEY"]],
    ["groq", ["GROQ_API_KEY"]],
    ["cerebras", ["CEREBRAS_API_KEY"]],
  ];

  return providers
    .filter(([, envNames]) => envNames.some((name) => Boolean(process.env[name])))
    .map(([provider]) => provider);
}

async function checkRuntime(workspaceRoot: string): Promise<DoctorCheck[]> {
  const instance = process.env.SHELLOCK_INCUS_INSTANCE;
  const runtimeProvider = process.env.SHELLOCK_RUNTIME_PROVIDER ?? "incus";
  const selectedImage = process.env.SHELLOCK_RUNTIME_IMAGE ?? "shellock-runtime";
  const selectedProfile = parseRuntimeProfile(process.env.SHELLOCK_RUNTIME_PROFILE);
  const checks: DoctorCheck[] = [];

  if (runtimeProvider === "dry-run") {
    checks.push({
      status: "warn",
      name: "runtime manager",
      detail: "dry-run provider; runtime commands will not create real isolation",
      hint: "Unset SHELLOCK_RUNTIME_PROVIDER or set it to incus before real security work.",
    });
    return checks;
  }

  if (!instance) {
    checks.push({ status: "pass", name: "runtime", detail: "local bash; SHELLOCK_INCUS_INSTANCE is not set" });
  }

  const incusBinary = process.env.SHELLOCK_INCUS_BINARY ?? "incus";
  const distrobuilderBinary = process.env.SHELLOCK_DISTROBUILDER_BINARY ?? "distrobuilder";
  const guestWorkspace = process.env.SHELLOCK_WORKSPACE_GUEST ?? "/workspace";
  const hostWorkspace = process.env.SHELLOCK_WORKSPACE_HOST ?? workspaceRoot;

  const version = await runCommand(incusBinary, ["version"]);
  checks.push(
    version.ok
      ? { status: "pass", name: "incus", detail: version.stdout.trim() || "available" }
      : {
          status: instance ? "fail" : "warn",
          name: "incus",
          detail: version.stderr || version.error || "incus command failed",
          hint: instance
            ? "Install Incus or unset SHELLOCK_INCUS_INSTANCE to use local bash."
            : "Install Incus before using /shellock-runtime bootstrap/create for isolated hands-on work.",
        },
  );

  const distrobuilder = await runCommand(distrobuilderBinary, ["--version"]);
  checks.push(
    distrobuilder.ok
      ? { status: "pass", name: "distrobuilder", detail: firstLine(distrobuilder.stdout) || "available" }
      : {
          status: "warn",
          name: "distrobuilder",
          detail: distrobuilder.stderr || distrobuilder.error || "distrobuilder command failed",
          hint: "Install distrobuilder before running /shellock-runtime bootstrap when the runtime image alias is missing.",
        },
  );

  if (version.ok) {
    checks.push(...await checkIncusAssets(incusBinary, selectedImage, selectedProfile));
  }

  if (!instance) return checks;

  const workspace = await runCommand(incusBinary, ["exec", instance, "--", "test", "-d", guestWorkspace]);
  checks.push(
    workspace.ok
      ? { status: "pass", name: "runtime workspace", detail: `${hostWorkspace} -> ${instance}:${guestWorkspace}` }
      : {
          status: "fail",
          name: "runtime workspace",
          detail: `${instance}:${guestWorkspace} is not reachable`,
          hint: "Start the instance and mount the current workspace at SHELLOCK_WORKSPACE_GUEST.",
        },
  );

  return checks;
}

async function checkIncusAssets(incusBinary: string, image: string, profile: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  const imageInfo = await runCommand(incusBinary, ["image", "info", image]);
  checks.push(
    imageInfo.ok
      ? { status: "pass", name: "runtime image", detail: image }
      : {
          status: "warn",
          name: "runtime image",
          detail: `${image} alias is missing`,
          hint: "Run /shellock-runtime bootstrap to build/import the Shellock image.",
        },
  );

  const profileInfo = await runCommand(incusBinary, ["profile", "show", profile]);
  checks.push(
    profileInfo.ok
      ? { status: "pass", name: "runtime profile", detail: profile }
      : {
          status: "warn",
          name: "runtime profile",
          detail: `${profile} profile is missing`,
          hint: "Run /shellock-runtime bootstrap --no-image or choose an existing SHELLOCK_RUNTIME_PROFILE.",
        },
  );

  return checks;
}

async function checkToolProfile(): Promise<DoctorCheck[]> {
  const selectedProfile = parseRuntimeProfile(process.env.SHELLOCK_RUNTIME_PROFILE);
  const groups = toolGroupsForProfile(selectedProfile);
  const available = await detectAvailableTools();
  return groups.map((group) => {
    const present = group.tools.filter((tool) => available.has(tool));
    const missing = group.tools.filter((tool) => !available.has(tool));
    if (missing.length === 0) {
      return { status: "pass", name: `tools:${group.name}`, detail: `${present.length}/${group.tools.length} available for ${selectedProfile}` };
    }
    return {
      status: group.required ? "fail" : "warn",
      name: `tools:${group.name}`,
      detail: `${present.length}/${group.tools.length} available for ${selectedProfile}; missing ${missing.join(", ")}`,
      hint: runtimeToolHint(group.required),
    };
  });
}

async function detectAvailableTools(): Promise<Set<string>> {
  const tools = Array.from(new Set(toolGroupsForProfile(parseRuntimeProfile(process.env.SHELLOCK_RUNTIME_PROFILE)).flatMap((group) => group.tools)));
  const script = [
    "set +e",
    `for t in ${tools.map((tool) => JSON.stringify(tool)).join(" ")}; do`,
    '  if command -v "$t" >/dev/null 2>&1; then printf "%s\\n" "$t"; fi',
    "done",
  ].join("\n");

  const instance = process.env.SHELLOCK_INCUS_INSTANCE;
  const incusBinary = process.env.SHELLOCK_INCUS_BINARY ?? "incus";
  const result = instance
    ? await runCommand(incusBinary, ["exec", instance, "--", "bash", "-lc", script])
    : await runCommand("bash", ["-lc", script]);

  if (!result.ok) return new Set();
  return new Set(result.stdout.split("\n").map((line) => line.trim()).filter(Boolean));
}

function runtimeToolHint(required: boolean): string {
  if (process.env.SHELLOCK_INCUS_INSTANCE) {
    return required
      ? "Rebuild the Shellock runtime image or choose a profile whose required tools match the task."
      : "Optional tools can be added to the Shellock runtime image when the task needs them.";
  }
  return required
    ? "Use a Shellock Incus runtime for this profile, choose a lighter SHELLOCK_RUNTIME_PROFILE, or install the missing local tools intentionally."
    : "Optional tools can be installed locally or inside the Shellock runtime when the task needs them.";
}

function firstLine(value: string): string {
  return value.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

async function readJsonRecord(path: string): Promise<Record<string, unknown>> {
  try {
    return asRecord(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch {
    return {};
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      error: err.message ?? String(error),
    };
  }
}

function label(status: DoctorStatus): string {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
