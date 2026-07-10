import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("shellock help and version are branded and side-effect free", async () => {
  const piAgentDir = await mkdtemp(join(tmpdir(), "pi-agent-"));
  const shellockAgentDir = join(await mkdtemp(join(tmpdir(), "shellock-home-")), "agent");
  const cli = resolve("dist/distro/cli.js");
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: piAgentDir,
    SHELLOCK_CODING_AGENT_DIR: shellockAgentDir,
    PI_OFFLINE: "1",
  };

  const help = spawnSync(process.execPath, [cli, "--help"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });

  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^shellock - Pi-family security operations agent harness/m);
  assert.match(help.stdout, /\/login/);
  assert.match(help.stdout, /does not copy credentials from Pi automatically/);

  const version = spawnSync(process.execPath, [cli, "--version"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });

  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), "0.1.0");
  await assert.rejects(readFile(join(shellockAgentDir, "settings.json"), "utf8"));
});

test("normal shellock startup creates settings without reading or copying Pi configuration", async () => {
  const piAgentDir = await mkdtemp(join(tmpdir(), "pi-agent-"));
  const shellockAgentDir = await mkdtemp(join(tmpdir(), "shellock-agent-"));
  const cli = resolve("dist/distro/cli.js");
  const piAuthPath = join(piAgentDir, "auth.json");
  const piModelsPath = join(piAgentDir, "models.json");
  const piSettingsPath = join(piAgentDir, "settings.json");

  writeFileSync(piAuthPath, JSON.stringify({ together: { type: "api_key", key: "secret" } }, null, 2));
  writeFileSync(piModelsPath, JSON.stringify({ providers: { custom: { apiKey: "literal-secret" } } }, null, 2));
  writeFileSync(
    piSettingsPath,
    JSON.stringify(
      {
        defaultProvider: "deepseek",
        defaultModel: "deepseek-v4-pro",
        defaultThinkingLevel: "medium",
        enabledModels: ["deepseek/deepseek-v4-pro", "together/zai-org/glm-5.2"],
        packages: ["/tmp/unrelated-pi-pack"],
        theme: "dark",
      },
      null,
      2,
    ),
  );

  const result = spawnSync(process.execPath, [cli, "--offline", "--list-models"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: piAgentDir,
      SHELLOCK_CODING_AGENT_DIR: shellockAgentDir,
      PI_OFFLINE: "1",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const shellockSettings = JSON.parse(await readFile(join(shellockAgentDir, "settings.json"), "utf8"));
  const shellockAuth = await readOptional(join(shellockAgentDir, "auth.json"));
  const shellockModels = await readOptional(join(shellockAgentDir, "models.json"));
  assert.equal(shellockSettings.defaultProvider, undefined);
  assert.equal(shellockSettings.defaultModel, undefined);
  assert.equal(shellockSettings.defaultThinkingLevel, "high");
  assert.deepEqual(shellockSettings.packages, []);
  assert.equal(shellockSettings.theme, "shellock-light/shellock-dark");
  assert.equal(shellockSettings.hideThinkingBlock, false);
  assert.equal(shellockSettings.enabledModels, undefined);
  assert.match(await readFile(join(shellockAgentDir, "themes", "shellock-dark.json"), "utf8"), /"name": "shellock-dark"/);
  assert.match(await readFile(join(shellockAgentDir, "themes", "shellock-light.json"), "utf8"), /"name": "shellock-light"/);
  assert.doesNotMatch(shellockAuth, /secret/);
  assert.doesNotMatch(shellockModels, /literal-secret|custom/);
  assert.equal(await readFile(piAuthPath, "utf8"), JSON.stringify({ together: { type: "api_key", key: "secret" } }, null, 2));
  assert.deepEqual(JSON.parse(await readFile(piSettingsPath, "utf8")), {
    defaultProvider: "deepseek",
    defaultModel: "deepseek-v4-pro",
    defaultThinkingLevel: "medium",
    enabledModels: ["deepseek/deepseek-v4-pro", "together/zai-org/glm-5.2"],
    packages: ["/tmp/unrelated-pi-pack"],
    theme: "dark",
  });
});

test("shellock migrates shellock-forced default model filters", async () => {
  const piAgentDir = await mkdtemp(join(tmpdir(), "pi-agent-"));
  const shellockAgentDir = await mkdtemp(join(tmpdir(), "shellock-agent-"));
  const cli = resolve("dist/distro/cli.js");

  await mkdir(shellockAgentDir, { recursive: true });
  writeFileSync(
    join(shellockAgentDir, "settings.json"),
    JSON.stringify(
      {
        defaultProvider: "together",
        defaultModel: "zai-org/glm-5.2",
        enabledModels: ["together/zai-org/glm-5.2", "deepseek/deepseek-v4-pro"],
      },
      null,
      2,
    ),
  );

  const result = spawnSync(process.execPath, [cli, "--offline", "--list-models"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: piAgentDir,
      SHELLOCK_CODING_AGENT_DIR: shellockAgentDir,
      PI_OFFLINE: "1",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /together\/zai-org\/glm-5\.2/);
  const shellockSettings = JSON.parse(await readFile(join(shellockAgentDir, "settings.json"), "utf8"));
  assert.equal(shellockSettings.defaultProvider, undefined);
  assert.equal(shellockSettings.defaultModel, undefined);
  assert.deepEqual(shellockSettings.enabledModels, ["deepseek/deepseek-v4-pro"]);
});

test("shellock preserves user-selected model settings", async () => {
  const piAgentDir = await mkdtemp(join(tmpdir(), "pi-agent-"));
  const shellockAgentDir = await mkdtemp(join(tmpdir(), "shellock-agent-"));
  const cli = resolve("dist/distro/cli.js");

  await mkdir(shellockAgentDir, { recursive: true });
  writeFileSync(
    join(shellockAgentDir, "settings.json"),
    JSON.stringify(
      {
        defaultProvider: "deepseek",
        defaultModel: "deepseek-v4-pro",
        enabledModels: ["zai/glm-5.2", "deepseek/deepseek-v4-pro"],
      },
      null,
      2,
    ),
  );

  const result = spawnSync(process.execPath, [cli, "--offline", "--list-models"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PI_CODING_AGENT_DIR: piAgentDir,
      SHELLOCK_CODING_AGENT_DIR: shellockAgentDir,
      PI_OFFLINE: "1",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  const shellockSettings = JSON.parse(await readFile(join(shellockAgentDir, "settings.json"), "utf8"));
  assert.equal(shellockSettings.defaultProvider, "deepseek");
  assert.equal(shellockSettings.defaultModel, "deepseek-v4-pro");
  assert.deepEqual(shellockSettings.enabledModels, ["deepseek/deepseek-v4-pro"]);
});

test("package exposes only the shellock binary", async () => {
  const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  assert.deepEqual(pkg.bin, {
    shellock: "./dist/distro/cli.js",
  });
  assert.equal(pkg.pi, undefined);
  assert.ok(pkg.files.includes("resources"));
});

test("shellock remains a pinned Pi-family distribution", async () => {
  const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  const upstream = JSON.parse(await readFile(resolve("node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
  const copied = JSON.parse(await readFile(resolve("dist/pi-core/package.json"), "utf8"));

  assert.equal(pkg.name, "@shellock/pi-coding-agent");
  assert.equal(pkg.scripts.prepack, "npm run build && npm run verify:pi-core:dist && npm run verify:runtime-image");
  assert.equal(pkg.dependencies["@earendil-works/pi-coding-agent"], upstream.version);
  for (const [name, version] of Object.entries(upstream.dependencies)) {
    assert.equal(pkg.dependencies[name], version);
  }
  assert.deepEqual(
    Object.keys(pkg.dependencies).sort(),
    ["@earendil-works/pi-coding-agent", ...Object.keys(upstream.dependencies)].sort(),
  );
  assert.equal(pkg.devDependencies?.["@earendil-works/pi-coding-agent"], undefined);
  assert.equal(pkg.peerDependencies?.["@earendil-works/pi-coding-agent"], undefined);
  assert.equal(existsSync(resolve("dist/pi-core/node_modules")), false);
  assert.equal(copied.name, "@shellock/pi-core");
  assert.equal(copied.version, upstream.version);
  assert.equal(
    await fileHash(resolve("dist/pi-core/dist/main.js")),
    await fileHash(resolve("node_modules/@earendil-works/pi-coding-agent/dist/main.js")),
  );
  assert.deepEqual(copied.piConfig, {
    name: "shellock",
    configDir: ".shellock",
  });
  assert.deepEqual(copied.shellockCore, {
    upstreamPackage: "@earendil-works/pi-coding-agent",
    upstreamVersion: upstream.version,
    distribution: "pi-family",
  });
});

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function fileHash(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
