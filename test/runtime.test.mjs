import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { DryRunRuntimeProvider } from "../dist/runtime/dry-run.js";
import { IncusProvider } from "../dist/runtime/incus.js";
import { runRuntimeCommand } from "../dist/runtime/commands.js";
import { BUNDLED_RUNTIME_PROFILES, toolGroupsForProfile } from "../dist/runtime/tooling.js";

test("runtime command reports current local execution without touching Incus", async () => {
  const output = await runRuntimeCommand("", {
    cwd: "/tmp/shellock-workspace",
    env: {
      SHELLOCK_RUNTIME_PROVIDER: "dry-run",
    },
  });

  assert.match(output, /runtime: local Pi bash/);
  assert.match(output, /workspace: \/tmp\/shellock-workspace/);
  assert.match(output, /manager: dry-run/);
});

test("runtime command manages lifecycle through a provider", async () => {
  const provider = new DryRunRuntimeProvider();
  const context = {
    cwd: "/tmp/shellock-workspace",
    provider,
    env: {},
  };

  const created = await runRuntimeCommand(
    "create shellock-lab --image shellock-runtime:test --profile net-basic --workspace '/tmp/shellock workspace'",
    context,
  );
  assert.match(created, /created shellock-lab with dry-run/);
  assert.match(created, /profile: net-basic/);
  assert.match(created, /workspace: \/tmp\/shellock workspace -> \/workspace/);
  assert.match(created, /attach: \/shellock-runtime attach shellock-lab/);

  assert.match(await runRuntimeCommand("start shellock-lab", context), /started shellock-lab/);
  assert.match(await runRuntimeCommand("status shellock-lab", context), /shellock-lab: running/);

  assert.equal(await runRuntimeCommand("snapshot shellock-lab clean", context), "snapshotted shellock-lab as clean");
  assert.match(await runRuntimeCommand("status", context), /snapshots=1/);

  assert.equal(await runRuntimeCommand("restore shellock-lab clean", context), "restored shellock-lab from clean");
  assert.match(await runRuntimeCommand("status shellock-lab", context), /shellock-lab: stopped/);

  assert.equal(await runRuntimeCommand("destroy shellock-lab", context), "destroyed shellock-lab");
  assert.match(await runRuntimeCommand("status shellock-lab", context), /shellock-lab: missing/);
});

test("runtime command attaches and detaches bash runtime in current environment", async () => {
  const env = {};
  const attached = await runRuntimeCommand("attach shellock-lab --workspace '/tmp/shellock workspace' --guest /workspace", {
    cwd: "/tmp/fallback",
    env,
  });

  assert.match(attached, /attached bash runtime to shellock-lab/);
  assert.equal(env.SHELLOCK_INCUS_INSTANCE, "shellock-lab");
  assert.equal(env.SHELLOCK_WORKSPACE_HOST, "/tmp/shellock workspace");
  assert.equal(env.SHELLOCK_WORKSPACE_GUEST, "/workspace");
  assert.equal(env.SHELLOCK_RUNTIME_PROFILE, "base");
  assert.match(await runRuntimeCommand("", { cwd: "/tmp/fallback", env }), /runtime: Incus shellock-lab mounted at \/workspace/);

  assert.equal(await runRuntimeCommand("detach", { cwd: "/tmp/fallback", env }), "detached bash runtime; using local Pi bash");
  assert.equal(env.SHELLOCK_INCUS_INSTANCE, undefined);
  assert.equal(env.SHELLOCK_RUNTIME_PROFILE, undefined);
  assert.match(await runRuntimeCommand("", { cwd: "/tmp/fallback", env }), /runtime: local Pi bash/);
});

test("runtime command records selected profile during create and attach", async () => {
  const provider = new DryRunRuntimeProvider();
  const env = {};
  await runRuntimeCommand("create shellock-lab --profile net-advanced", {
    cwd: "/tmp/shellock-workspace",
    provider,
    env,
  });

  assert.equal(env.SHELLOCK_RUNTIME_PROFILE, "net-advanced");
  const attached = await runRuntimeCommand("attach shellock-lab --profile lab", {
    cwd: "/tmp/shellock-workspace",
    env,
  });

  assert.match(attached, /profile: lab/);
  assert.equal(env.SHELLOCK_RUNTIME_PROFILE, "lab");
});

test("runtime tooling metadata is profile-aware", () => {
  assert.deepEqual(BUNDLED_RUNTIME_PROFILES, ["base", "net-basic", "net-advanced", "lab", "vm-danger"]);
  assert.deepEqual(toolGroupsForProfile("base").map((group) => group.name), ["core"]);
  assert.deepEqual(toolGroupsForProfile("net-basic").map((group) => group.name), ["core", "recon"]);
  assert.deepEqual(toolGroupsForProfile("lab").map((group) => group.name), [
    "core",
    "recon",
    "web",
    "network-support",
    "binary",
    "forensics",
    "modern-security",
  ]);
});

test("runtime image pins and verifies modern security tool installers", async () => {
  const image = await readFile(resolve("images/incus/shellock.yaml"), "utf8");

  for (const pin of [
    "NUCLEI_VERSION=3.9.0",
    "GITLEAKS_VERSION=8.30.1",
    "TRUFFLEHOG_VERSION=3.95.6",
    "SYFT_VERSION=1.46.0",
    "GRYPE_VERSION=0.115.0",
    "FFUF_VERSION=2.1.0",
    "SEMGREP_VERSION=1.168.0",
  ]) {
    assert.match(image, new RegExp(pin.replaceAll(".", "\\.")));
  }

  assert.doesNotMatch(image, /@latest|\/latest/);
  assert.match(image, /sha256sum -c -/);
  assert.match(image, /semgrep==\$\{SEMGREP_VERSION\}/);

  for (const tool of ["nuclei", "gitleaks", "trufflehog", "syft", "grype", "ffuf", "semgrep"]) {
    assert.match(image, new RegExp(`/usr/local/bin/${tool}`));
  }

  const verifier = spawnSync(process.execPath, ["scripts/verify-runtime-image.mjs"], {
    cwd: resolve("."),
    encoding: "utf8",
  });
  assert.equal(verifier.status, 0, verifier.stderr);
  assert.match(verifier.stdout, /runtime image verifier passed/);
});

test("runtime command bootstraps bundled runtime assets through provider", async () => {
  const provider = new DryRunRuntimeProvider();
  const output = await runRuntimeCommand("bootstrap --no-image --profile net-basic", {
    cwd: "/tmp/shellock-workspace",
    provider,
    env: {},
    packageRoot: resolve("."),
  });

  assert.match(output, /bootstrapped runtime assets with dry-run/);
  assert.match(output, /image \(skipped\): skipped/);
  assert.match(output, /profile net-basic: created/);
});

test("runtime bootstrap defaults to every bundled profile", async () => {
  const provider = new DryRunRuntimeProvider();
  const output = await runRuntimeCommand("bootstrap --no-image", {
    cwd: "/tmp/shellock-workspace",
    provider,
    env: {},
    packageRoot: resolve("."),
  });

  for (const profile of ["base", "net-basic", "net-advanced", "lab", "vm-danger"]) {
    assert.match(output, new RegExp(`profile ${profile}: created`));
  }
});

test("incus provider creates missing profiles and builds missing image", async () => {
  const calls = [];
  const inputCalls = [];
  const buildDir = await mkdtemp(join(tmpdir(), "shellock-runtime-build-"));
  const provider = new IncusProvider(
    "incus",
    async (binary, args) => {
      calls.push([binary, ...args]);
      if (args[0] === "profile" && args[1] === "show") throw new Error("missing profile");
      if (args[0] === "image" && args[1] === "info") throw new Error("missing image");
      return { stdout: "", stderr: "" };
    },
    async (binary, args, input) => {
      inputCalls.push({ command: [binary, ...args], input });
      return { stdout: "", stderr: "" };
    },
    "distrobuilder",
  );

  const result = await provider.bootstrap({
    image: "shellock-runtime:test",
    imageRecipePath: resolve("images/incus/shellock.yaml"),
    imageBuildDir: buildDir,
    profiles: [
      {
        profile: "base",
        path: resolve("profiles/incus/base.yaml"),
      },
    ],
  });

  assert.equal(result.image, "built");
  assert.deepEqual(result.profiles, [{ profile: "base", status: "created" }]);
  assert.deepEqual(calls, [
    ["incus", "version"],
    ["incus", "profile", "show", "base"],
    ["incus", "profile", "create", "base"],
    ["incus", "image", "info", "shellock-runtime:test"],
    ["distrobuilder", "build-incus", resolve("images/incus/shellock.yaml"), buildDir],
    ["incus", "image", "import", join(buildDir, "lxd.tar.xz"), join(buildDir, "rootfs.squashfs"), "--alias", "shellock-runtime:test"],
  ]);
  assert.deepEqual(inputCalls.map((call) => call.command), [["incus", "profile", "edit", "base"]]);
  assert.match(inputCalls[0].input, /name: base/);
});
