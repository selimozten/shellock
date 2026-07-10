import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const upstreamRoot = join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent");
const verifyDist = process.argv.includes("--dist");
const rootPackage = await readJson(join(packageRoot, "package.json"));
const upstreamPackage = await readJson(join(upstreamRoot, "package.json"));
const launcher = await readFile(join(packageRoot, "src", "distro", "cli.ts"), "utf8");

const piVersion = upstreamPackage.version;
const declaredVersion = rootPackage.dependencies?.["@earendil-works/pi-coding-agent"];
const rootDependencies = rootPackage.dependencies ?? {};
const allowedRuntimeDependencies = new Set(["@earendil-works/pi-coding-agent", ...Object.keys(upstreamPackage.dependencies ?? {})]);

assert(rootPackage.name === "@shellock/pi-coding-agent", "package must publish as the Shellock Pi coding-agent distribution");
assert(rootPackage.bin && Object.keys(rootPackage.bin).length === 1 && rootPackage.bin.shellock === "./dist/distro/cli.js", "package must expose only the shellock binary");
assert(rootPackage.pi === undefined, "Shellock distribution must not advertise itself as an installable Pi resource pack");
assert(
  rootPackage.scripts?.prepack === "npm run build && npm run verify:pi-core:dist && npm run verify:runtime-image",
  "prepack must rebuild and verify the Shellock distribution before npm pack/publish",
);
assert(typeof declaredVersion === "string" && declaredVersion === piVersion, `Pi core dependency must be pinned to installed version ${piVersion}; found ${declaredVersion ?? "missing"}`);
for (const [name, version] of Object.entries(upstreamPackage.dependencies ?? {})) {
  assert(rootDependencies[name] === version, `Shellock must mirror Pi runtime dependency ${name}@${version}; found ${rootDependencies[name] ?? "missing"}`);
}
for (const name of Object.keys(rootDependencies)) {
  assert(allowedRuntimeDependencies.has(name), `Shellock runtime dependency ${name} is not part of the upstream Pi distribution surface`);
}
assert(!rootPackage.devDependencies?.["@earendil-works/pi-coding-agent"], "Pi core must be a runtime dependency, not dev-only");
assert(!rootPackage.peerDependencies?.["@earendil-works/pi-coding-agent"], "Pi core must not be an optional peer for the Shellock distribution");
assert(launcher.includes("dist\", \"pi-core\", \"dist\", \"main.js\""), "launcher must call the copied Pi core main.js");
assert(launcher.includes("await main(args"), "launcher must delegate execution to Pi main()");
assert(launcher.includes("extensionFactories"), "launcher must inject Shellock through Pi extension factories");
assert(!existsSync(join(packageRoot, "src", "cli", "main.ts")), "custom Shellock agent-loop CLI must not exist");
assert(!existsSync(join(packageRoot, "src", "cli", "args.ts")), "custom Shellock CLI args parser must not exist");

const copiedPackagePath = join(packageRoot, "dist", "pi-core", "package.json");
if (verifyDist) {
  assert(existsSync(copiedPackagePath), "dist/pi-core/package.json must exist after build");
  const copiedPackage = await readJson(copiedPackagePath);
  assert(copiedPackage.name === "@shellock/pi-core", "copied Pi core package must be Shellock-branded");
  assert(copiedPackage.version === piVersion, `copied Pi core version must match upstream ${piVersion}`);
  assert(copiedPackage.piConfig?.name === "shellock", "copied Pi core must use shellock piConfig name");
  assert(copiedPackage.piConfig?.configDir === ".shellock", "copied Pi core must use .shellock config dir");
  assert(copiedPackage.shellockCore?.upstreamPackage === "@earendil-works/pi-coding-agent", "copied Pi core must record upstream package");
  assert(copiedPackage.shellockCore?.upstreamVersion === piVersion, "copied Pi core must record upstream version");
  assert(!existsSync(join(packageRoot, "dist", "pi-core", "node_modules")), "copied Pi core must resolve through package dependencies, not a dist node_modules symlink");
  await assertDirectoryHashesEqual(join(upstreamRoot, "dist"), join(packageRoot, "dist", "pi-core", "dist"));
  await assertFileHashesEqual(join(upstreamRoot, "README.md"), join(packageRoot, "dist", "pi-core", "README.md"));
  await assertFileHashesEqual(join(upstreamRoot, "CHANGELOG.md"), join(packageRoot, "dist", "pi-core", "CHANGELOG.md"));
}

console.log(`Pi core verifier passed${verifyDist ? " with dist" : ""}: @earendil-works/pi-coding-agent ${piVersion}`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function assertDirectoryHashesEqual(sourceDir, copiedDir) {
  const sourceFiles = await listFiles(sourceDir);
  const copiedFiles = await listFiles(copiedDir);
  assert(
    JSON.stringify(sourceFiles) === JSON.stringify(copiedFiles),
    "copied Pi dist file list must match upstream exactly",
  );

  for (const file of sourceFiles) {
    await assertFileHashesEqual(join(sourceDir, file), join(copiedDir, file));
  }
}

async function listFiles(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files.sort();
}

async function assertFileHashesEqual(sourcePath, copiedPath) {
  const sourceHash = await fileHash(sourcePath);
  const copiedHash = await fileHash(copiedPath);
  assert(sourceHash === copiedHash, `copied Pi core file differs from upstream: ${copiedPath}`);
}

async function fileHash(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
