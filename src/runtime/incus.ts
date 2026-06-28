import { spawn, execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  RuntimeBootstrapOptions,
  RuntimeBootstrapResult,
  RuntimeProfileAsset,
  RuntimeProvider,
  RuntimeSessionOptions,
} from "./runtime.js";

const execFileAsync = promisify(execFile);

type CommandRunner = (binary: string, args: string[], timeout?: number) => Promise<{ stdout: string; stderr: string }>;
type InputCommandRunner = (binary: string, args: string[], input: string, timeout?: number) => Promise<{ stdout: string; stderr: string }>;

export class IncusProvider implements RuntimeProvider {
  readonly name = "incus";

  constructor(
    private readonly binary = "incus",
    private readonly commandRunner: CommandRunner = defaultRun,
    private readonly inputCommandRunner: InputCommandRunner = defaultRunWithInput,
    private readonly imageBuilderBinary = "distrobuilder",
  ) {}

  async ensureHost(): Promise<void> {
    await this.run(["version"]);
  }

  async bootstrap(options: RuntimeBootstrapOptions): Promise<RuntimeBootstrapResult> {
    await this.ensureHost();
    const profiles = [];

    for (const profile of options.profiles) {
      profiles.push(await this.ensureProfile(profile));
    }

    if (!options.image) return { image: "skipped", profiles };

    const imageExists = await this.imageExists(options.image);
    if (imageExists) return { image: "ready", profiles };

    await mkdir(options.imageBuildDir, { recursive: true });
    await this.runExternal(this.imageBuilderBinary, ["build-incus", options.imageRecipePath, options.imageBuildDir], 30 * 60_000);
    await this.run([
      "image",
      "import",
      join(options.imageBuildDir, "lxd.tar.xz"),
      join(options.imageBuildDir, "rootfs.squashfs"),
      "--alias",
      options.image,
    ], 10 * 60_000);

    return { image: "built", profiles };
  }

  async pullOrBuildImage(image: string): Promise<void> {
    await this.run(["image", "info", image]);
  }

  async createSession(options: RuntimeSessionOptions): Promise<void> {
    const instanceType = options.isolation === "vm" ? "--vm" : "--container";
    await this.run([
      "init",
      options.image,
      options.name,
      instanceType,
      "--profile",
      options.profile,
      "--quiet",
    ]);
    await this.run([
      "config",
      "device",
      "add",
      options.name,
      "workspace",
      "disk",
      `source=${options.workspacePath}`,
      "path=/workspace",
    ]);
  }

  async start(name: string): Promise<void> {
    await this.run(["start", name]);
  }

  async snapshot(name: string, label: string): Promise<void> {
    await this.run(["snapshot", name, label]);
  }

  async restore(name: string, label: string): Promise<void> {
    await this.run(["restore", name, label]);
  }

  async stop(name: string): Promise<void> {
    await this.run(["stop", name]);
  }

  async destroy(name: string): Promise<void> {
    await this.run(["delete", name, "--force"]);
  }

  async status(name?: string): Promise<string> {
    const result = await this.run(name ? ["list", name] : ["list"]);
    return result.stdout.trim();
  }

  private async ensureProfile(asset: RuntimeProfileAsset): Promise<RuntimeBootstrapResult["profiles"][number]> {
    const exists = await this.profileExists(asset.profile);
    if (exists) return { profile: asset.profile, status: "ready" };

    await this.run(["profile", "create", asset.profile]);
    await this.runWithInput(["profile", "edit", asset.profile], await readText(asset.path));
    return { profile: asset.profile, status: "created" };
  }

  private async profileExists(profile: string): Promise<boolean> {
    try {
      await this.run(["profile", "show", profile]);
      return true;
    } catch {
      return false;
    }
  }

  private async imageExists(image: string): Promise<boolean> {
    try {
      await this.run(["image", "info", image]);
      return true;
    } catch {
      return false;
    }
  }

  private async runExternal(binary: string, args: string[], timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
    return this.commandRunner(binary, args, timeout);
  }

  private async run(args: string[], timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
    return this.commandRunner(this.binary, args, timeout);
  }

  private async runWithInput(args: string[], input: string, timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
    return this.inputCommandRunner(this.binary, args, input, timeout);
  }
}

async function readText(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}

async function defaultRun(binary: string, args: string[], timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(binary, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 1024 * 1024 * 16,
  });
  return { stdout, stderr };
}

async function defaultRunWithInput(binary: string, args: string[], input: string, timeout = 30_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${binary} ${args.join(" ")} timed out after ${timeout}ms`));
    }, timeout);

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${binary} ${args.join(" ")} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
    child.stdin.end(input);
  });
}
