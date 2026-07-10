import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tempRoot = await mkdtemp(join(tmpdir(), "shellock-pack-install-"));
const packDir = join(tempRoot, "pack");
const installDir = join(tempRoot, "install");

try {
  await mkdir(packDir, { recursive: true });
  await mkdir(installDir, { recursive: true });

  const pack = run("npm", ["pack", "--pack-destination", packDir, "--json"], { cwd: packageRoot });
  const [packed] = parsePackOutput(pack.stdout);
  if (packed.name !== "@shellock/pi-coding-agent") {
    throw new Error(`packed package name mismatch: ${packed.name}`);
  }
  assertPackedSurface(packed);

  const tarball = join(packDir, packed.filename);
  run("npm", ["init", "-y"], { cwd: installDir });
  run("npm", ["install", tarball], { cwd: installDir });
  assertInstalledSurface(installDir);

  const metadata = run(
    process.execPath,
    [
      "-e",
      [
        "const shellock=require('./node_modules/@shellock/pi-coding-agent/package.json');",
        "const pi=require('./node_modules/@earendil-works/pi-coding-agent/package.json');",
        "if (shellock.dependencies['@earendil-works/pi-coding-agent'] !== pi.version) throw new Error('Pi dependency mismatch');",
      ].join(""),
    ],
    { cwd: installDir },
  );
  if (metadata.status !== 0) throw new Error(metadata.stderr);

  run("./node_modules/.bin/shellock", ["--version"], { cwd: installDir });
  const listModels = run("./node_modules/.bin/shellock", ["--offline", "--list-models"], {
    cwd: installDir,
    env: {
      ...process.env,
      PI_OFFLINE: "1",
      SHELLOCK_CODING_AGENT_DIR: join(installDir, "agent"),
    },
  });
  if (/No models match pattern/.test(listModels.stdout + listModels.stderr)) {
    throw new Error(`fresh install emitted model-filter warnings\n${listModels.stdout}\n${listModels.stderr}`);
  }

  console.log(`pack install verifier passed: ${packed.name}@${packed.version}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function parsePackOutput(stdout) {
  const trimmed = stdout.trim();
  const start = trimmed.lastIndexOf("\n[");
  const json = start === -1 ? trimmed : trimmed.slice(start + 1);
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`could not parse npm pack JSON output\n${stdout}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertPackedSurface(packed) {
  const files = (packed.files ?? []).map((entry) => entry.path);
  const fileSet = new Set(files);
  const requiredFiles = [
    "README.md",
    "package.json",
    "dist/distro/cli.js",
    "dist/pi-core/dist/main.js",
    "dist/pi-core/package.json",
    "dist/pi/extensions/shellock.js",
    "dist/pi/extensions/bedrock-mantle.js",
    "dist/pi/extensions/incus-bash.js",
    "resources/skills/repository-security-scan/SKILL.md",
    "resources/skills/security-assessment/SKILL.md",
    "resources/themes/shellock-dark.json",
    "resources/themes/shellock-light.json",
    "images/incus/shellock.yaml",
    "profiles/incus/base.yaml",
  ];

  for (const path of requiredFiles) {
    if (!fileSet.has(path)) throw new Error(`packed artifact missing ${path}`);
  }

  const forbidden = files.filter(
    (path) =>
      path.startsWith("src/") ||
      path.startsWith("test/") ||
      path.startsWith("node_modules/") ||
      path.includes("/node_modules/") ||
      path.includes("shellock-case"),
  );
  if (forbidden.length > 0) {
    throw new Error(`packed artifact exposes non-distribution files:\n${forbidden.join("\n")}`);
  }
}

function assertInstalledSurface(installDir) {
  const packageRoot = join(installDir, "node_modules", "@shellock", "pi-coding-agent");
  if (existsSync(join(packageRoot, "src"))) throw new Error("installed package must not include src/");
  if (existsSync(join(packageRoot, "test"))) throw new Error("installed package must not include test/");
  if (existsSync(join(packageRoot, "dist", "pi-core", "node_modules"))) {
    throw new Error("installed copied Pi core must not include dist/pi-core/node_modules");
  }

  const shellockBin = join(installDir, "node_modules", ".bin", "shellock");
  const shellockCaseBin = join(installDir, "node_modules", ".bin", "shellock-case");
  if (!existsSync(shellockBin)) throw new Error("installed package must expose shellock binary");
  if (existsSync(shellockCaseBin)) throw new Error("installed package must not expose shellock-case binary");
}
