import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const imagePath = join(packageRoot, "images", "incus", "shellock.yaml");
const image = await readFile(imagePath, "utf8");
const installer = extractInstaller(image);

const pins = new Map([
  ["NUCLEI_VERSION", "3.9.0"],
  ["GITLEAKS_VERSION", "8.30.1"],
  ["TRUFFLEHOG_VERSION", "3.95.6"],
  ["SYFT_VERSION", "1.46.0"],
  ["GRYPE_VERSION", "0.115.0"],
  ["FFUF_VERSION", "2.1.0"],
  ["SEMGREP_VERSION", "1.168.0"],
]);

const requiredBins = ["nuclei", "gitleaks", "trufflehog", "syft", "grype", "ffuf", "semgrep"];

assert(installer.startsWith("#!/usr/bin/env bash\n"), "installer heredoc must preserve a bash shebang");
assert(installer.includes("set -euo pipefail"), "installer must run with strict shell settings");
assert(!/@latest|\/latest/.test(installer), "installer must not use floating latest references");
assert(installer.includes("sha256sum -c -"), "installer must verify downloaded archives with sha256sum");

for (const [name, version] of pins) {
  assert(installer.includes(`${name}=${version}`), `missing pin ${name}=${version}`);
}

for (const bin of requiredBins) {
  assert(installer.includes(`/usr/local/bin/${bin}`), `installer does not place ${bin} in /usr/local/bin`);
}

for (const tool of ["nuclei", "gitleaks", "trufflehog", "syft", "grype", "ffuf"]) {
  assert(new RegExp(`install_from_(tar|zip) \\\\\\n\\s*${tool} \\\\\\n[\\s\\S]*?_checksums\\.txt`).test(installer), `${tool} install must use an upstream checksums file`);
}

assert(installer.includes('"semgrep==${SEMGREP_VERSION}"'), "semgrep must be installed with the pinned package version");

const tempDir = await mkdtemp(join(tmpdir(), "shellock-runtime-verify-"));
try {
  const scriptPath = join(tempDir, "shellock-install-modern-tools");
  await writeFile(scriptPath, installer, "utf8");
  const result = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  assert(result.status === 0, result.stderr || "bash -n failed for runtime installer");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log(`runtime image verifier passed: ${imagePath}`);

function extractInstaller(value) {
  const start = value.indexOf("      #!/usr/bin/env bash\n");
  assert(start >= 0, "installer heredoc body not found");
  const end = value.indexOf("      SHELLOCK_INSTALL_MODERN_TOOLS", start);
  assert(end > start, "installer heredoc terminator not found");

  return value
    .slice(start, end)
    .split("\n")
    .map((line) => line.startsWith("      ") ? line.slice(6) : line)
    .join("\n")
    .replace(/\n+$/, "\n");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
