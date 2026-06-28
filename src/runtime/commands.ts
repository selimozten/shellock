import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IsolationMode, RuntimeProfile } from "../types.js";
import { DryRunRuntimeProvider } from "./dry-run.js";
import { IncusProvider } from "./incus.js";
import type { RuntimeBootstrapOptions, RuntimeProfileAsset, RuntimeProvider, RuntimeSessionOptions } from "./runtime.js";
import { BUNDLED_RUNTIME_PROFILES } from "./tooling.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const RUNTIME_PROFILES = new Set<RuntimeProfile>([
  "base",
  "net-basic",
  "net-advanced",
  "lab",
  "vm-danger",
]);
export interface RuntimeCommandContext {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  provider?: RuntimeProvider;
  runtimeStatus?: () => string;
  packageRoot?: string;
}

export async function runRuntimeCommand(input: string, context: RuntimeCommandContext): Promise<string> {
  const env = context.env ?? process.env;
  const tokens = tokenize(input);
  const action = tokens.shift() ?? "current";

  if (action === "help" || action === "--help" || action === "-h") {
    return runtimeHelp();
  }

  if (action === "current") {
    return [
      `runtime: ${context.runtimeStatus?.() ?? localRuntimeStatus(env)}`,
      `workspace: ${context.cwd}`,
      `manager: ${selectedProviderName(env)}`,
    ].join("\n");
  }

  const provider = context.provider ?? createRuntimeProvider(env);

  if (action === "bootstrap") {
    const options = parseBootstrapOptions(tokens, env, context.packageRoot ?? PACKAGE_ROOT);
    const result = await provider.bootstrap(options);
    const imageLabel = options.image || "(skipped)";
    return [
      `bootstrapped runtime assets with ${provider.name}`,
      `image ${imageLabel}: ${result.image}`,
      ...result.profiles.map((profile) => `profile ${profile.profile}: ${profile.status}`),
    ].join("\n");
  }

  if (action === "status") {
    const name = tokens.shift();
    assertNoExtra(tokens, "status");
    return formatProviderOutput(provider, await provider.status(name));
  }

  if (action === "create") {
    const options = parseCreateOptions(tokens, context.cwd, env);
    await provider.ensureHost();
    await provider.pullOrBuildImage(options.image);
    await provider.createSession(options);
    env.SHELLOCK_RUNTIME_IMAGE = options.image;
    env.SHELLOCK_RUNTIME_PROFILE = options.profile;
    env.SHELLOCK_WORKSPACE_HOST = options.workspacePath;
    return [
      `created ${options.name} with ${provider.name}`,
      `image: ${options.image}`,
      `profile: ${options.profile}`,
      `isolation: ${options.isolation}`,
      `workspace: ${options.workspacePath} -> /workspace`,
      `attach: /shellock-runtime attach ${options.name}`,
    ].join("\n");
  }

  if (action === "attach") {
    const options = parseAttachOptions(tokens, context.cwd, env);
    env.SHELLOCK_INCUS_INSTANCE = options.name;
    env.SHELLOCK_WORKSPACE_HOST = options.workspacePath;
    env.SHELLOCK_WORKSPACE_GUEST = options.guestWorkspace;
    env.SHELLOCK_RUNTIME_PROFILE = options.profile;
    return [
      `attached bash runtime to ${options.name}`,
      `profile: ${options.profile}`,
      `workspace: ${options.workspacePath} -> ${options.guestWorkspace}`,
    ].join("\n");
  }

  if (action === "detach") {
    assertNoExtra(tokens, "detach");
    delete env.SHELLOCK_INCUS_INSTANCE;
    delete env.SHELLOCK_WORKSPACE_HOST;
    delete env.SHELLOCK_WORKSPACE_GUEST;
    delete env.SHELLOCK_RUNTIME_PROFILE;
    return "detached bash runtime; using local Pi bash";
  }

  const name = tokens.shift();
  if (!name) throw new Error(`Usage: /shellock-runtime ${action} <name>`);

  if (action === "start") {
    assertNoExtra(tokens, "start");
    await provider.start(name);
    return [`started ${name}`, `attach: /shellock-runtime attach ${name}`].join("\n");
  }

  if (action === "stop") {
    assertNoExtra(tokens, "stop");
    await provider.stop(name);
    return `stopped ${name}`;
  }

  if (action === "destroy") {
    assertNoExtra(tokens, "destroy");
    await provider.destroy(name);
    return `destroyed ${name}`;
  }

  if (action === "snapshot") {
    const label = tokens.shift();
    if (!label) throw new Error("Usage: /shellock-runtime snapshot <name> <label>");
    assertNoExtra(tokens, "snapshot");
    await provider.snapshot(name, label);
    return `snapshotted ${name} as ${label}`;
  }

  if (action === "restore") {
    const label = tokens.shift();
    if (!label) throw new Error("Usage: /shellock-runtime restore <name> <label>");
    assertNoExtra(tokens, "restore");
    await provider.restore(name, label);
    return `restored ${name} from ${label}`;
  }

  throw new Error(`Unknown runtime action: ${action}\n\n${runtimeHelp()}`);
}

function parseAttachOptions(tokens: string[], cwd: string, env: NodeJS.ProcessEnv): {
  name: string;
  workspacePath: string;
  guestWorkspace: string;
  profile: RuntimeProfile;
} {
  const name = tokens.shift();
  if (!name) throw new Error("Usage: /shellock-runtime attach <name> [--workspace path] [--guest path] [--profile profile]");

  const options = {
    name,
    workspacePath: env.SHELLOCK_WORKSPACE_HOST ?? cwd,
    guestWorkspace: env.SHELLOCK_WORKSPACE_GUEST ?? "/workspace",
    profile: parseProfile(env.SHELLOCK_RUNTIME_PROFILE ?? "base"),
  };

  while (tokens.length > 0) {
    const token = tokens.shift();
    if (!token) continue;

    if (token === "--workspace") {
      options.workspacePath = requiredValue(tokens, token);
    } else if (token === "--guest") {
      options.guestWorkspace = requiredValue(tokens, token);
    } else if (token === "--profile") {
      options.profile = parseProfile(requiredValue(tokens, token));
    } else if (token.startsWith("--")) {
      throw new Error(`Unknown attach option: ${token}`);
    } else {
      throw new Error(`Unexpected attach argument: ${token}`);
    }
  }

  return options;
}

function createRuntimeProvider(env: NodeJS.ProcessEnv): RuntimeProvider {
  if (selectedProviderName(env) === "dry-run") return new DryRunRuntimeProvider();
  return new IncusProvider(
    env.SHELLOCK_INCUS_BINARY ?? "incus",
    undefined,
    undefined,
    env.SHELLOCK_DISTROBUILDER_BINARY ?? "distrobuilder",
  );
}

function selectedProviderName(env: NodeJS.ProcessEnv): "dry-run" | "incus" {
  return env.SHELLOCK_RUNTIME_PROVIDER === "dry-run" ? "dry-run" : "incus";
}

function parseCreateOptions(tokens: string[], cwd: string, env: NodeJS.ProcessEnv): RuntimeSessionOptions {
  const options: {
    name?: string;
    image: string;
    profile: RuntimeProfile;
    workspacePath: string;
    isolation: IsolationMode;
  } = {
    image: env.SHELLOCK_RUNTIME_IMAGE ?? "shellock-runtime",
    profile: parseProfile(env.SHELLOCK_RUNTIME_PROFILE ?? "base"),
    workspacePath: env.SHELLOCK_WORKSPACE_HOST ?? cwd,
    isolation: "container",
  };

  while (tokens.length > 0) {
    const token = tokens.shift();
    if (!token) continue;

    if (token === "--image") {
      options.image = requiredValue(tokens, token);
    } else if (token === "--profile") {
      options.profile = parseProfile(requiredValue(tokens, token));
    } else if (token === "--workspace") {
      options.workspacePath = requiredValue(tokens, token);
    } else if (token === "--vm") {
      options.isolation = "vm";
    } else if (token === "--container") {
      options.isolation = "container";
    } else if (token.startsWith("--")) {
      throw new Error(`Unknown create option: ${token}`);
    } else if (!options.name) {
      options.name = token;
    } else {
      throw new Error(`Unexpected create argument: ${token}`);
    }
  }

  if (!options.name) throw new Error("Usage: /shellock-runtime create <name> [--image image] [--profile profile] [--workspace path] [--vm]");

  return {
    name: options.name,
    image: options.image,
    profile: options.profile,
    workspacePath: options.workspacePath,
    isolation: options.isolation,
  };
}

function parseBootstrapOptions(tokens: string[], env: NodeJS.ProcessEnv, packageRoot: string): RuntimeBootstrapOptions {
  const requestedProfiles = new Set<RuntimeProfile>();
  const options = {
    image: env.SHELLOCK_RUNTIME_IMAGE ?? "shellock-runtime",
    imageRecipePath: env.SHELLOCK_RUNTIME_IMAGE_RECIPE ?? join(packageRoot, "images", "incus", "shellock.yaml"),
    imageBuildDir: env.SHELLOCK_RUNTIME_IMAGE_BUILD_DIR ?? join(tmpdir(), "shellock-runtime-image"),
    includeImage: true,
    allProfiles: false,
  };

  while (tokens.length > 0) {
    const token = tokens.shift();
    if (!token) continue;

    if (token === "--image") {
      options.image = requiredValue(tokens, token);
    } else if (token === "--recipe") {
      options.imageRecipePath = requiredValue(tokens, token);
    } else if (token === "--build-dir") {
      options.imageBuildDir = requiredValue(tokens, token);
    } else if (token === "--profile") {
      requestedProfiles.add(parseProfile(requiredValue(tokens, token)));
    } else if (token === "--all-profiles") {
      options.allProfiles = true;
    } else if (token === "--no-image") {
      options.includeImage = false;
    } else if (token.startsWith("--")) {
      throw new Error(`Unknown bootstrap option: ${token}`);
    } else {
      throw new Error(`Unexpected bootstrap argument: ${token}`);
    }
  }

  const profiles = selectProfileAssets(packageRoot, options.allProfiles, requestedProfiles);
  if (!options.includeImage) {
    options.image = "";
    options.imageRecipePath = "";
    options.imageBuildDir = "";
  }

  return {
    image: options.image,
    imageRecipePath: options.imageRecipePath,
    imageBuildDir: options.imageBuildDir,
    profiles,
  };
}

function selectProfileAssets(packageRoot: string, allProfiles: boolean, requestedProfiles: Set<RuntimeProfile>): RuntimeProfileAsset[] {
  const profiles: RuntimeProfile[] = allProfiles || requestedProfiles.size === 0 ? BUNDLED_RUNTIME_PROFILES : [...requestedProfiles];
  return profiles.map((profile) => ({
    profile,
    path: join(packageRoot, "profiles", "incus", `${profile}.yaml`),
  }));
}

function parseProfile(value: string): RuntimeProfile {
  if (RUNTIME_PROFILES.has(value as RuntimeProfile)) return value as RuntimeProfile;
  throw new Error(`Unknown runtime profile: ${value}`);
}

function requiredValue(tokens: string[], flag: string): string {
  const value = tokens.shift();
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function assertNoExtra(tokens: string[], action: string): void {
  if (tokens.length > 0) throw new Error(`Unexpected ${action} argument: ${tokens.join(" ")}`);
}

function formatProviderOutput(provider: RuntimeProvider, output: string): string {
  return [`manager: ${provider.name}`, output || "no status output"].join("\n");
}

function localRuntimeStatus(env: NodeJS.ProcessEnv): string {
  const instance = env.SHELLOCK_INCUS_INSTANCE;
  if (!instance) return "local Pi bash";

  const guestWorkspace = env.SHELLOCK_WORKSPACE_GUEST ?? "/workspace";
  return `Incus ${instance} mounted at ${guestWorkspace}`;
}

function runtimeHelp(): string {
  return [
    "Usage: /shellock-runtime [current|bootstrap|status|create|start|attach|detach|stop|snapshot|restore|destroy]",
    "",
    "Examples:",
    "  /shellock-runtime",
    "  /shellock-runtime bootstrap",
    "  /shellock-runtime bootstrap --no-image --profile net-basic",
    "  /shellock-runtime status",
    "  /shellock-runtime create shellock-lab --profile net-basic --image shellock-runtime",
    "  /shellock-runtime create shellock-vm --vm --profile lab",
    "  /shellock-runtime start shellock-lab",
    "  /shellock-runtime attach shellock-lab --profile net-basic",
    "  /shellock-runtime detach",
    "  /shellock-runtime snapshot shellock-lab clean",
    "  /shellock-runtime restore shellock-lab clean",
    "  /shellock-runtime stop shellock-lab",
    "  /shellock-runtime destroy shellock-lab",
    "",
    "Set SHELLOCK_RUNTIME_PROVIDER=dry-run to test command flow without Incus.",
  ].join("\n");
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (const char of input.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaped) current += "\\";
  if (quote) throw new Error("Unterminated quote in runtime command");
  if (current) tokens.push(current);
  return tokens;
}
