import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const piRoot = join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent");
const outRoot = join(packageRoot, "dist", "pi-core");

await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });
await cp(join(piRoot, "dist"), join(outRoot, "dist"), { recursive: true });

for (const name of ["README.md", "CHANGELOG.md"]) {
  await copyFile(join(piRoot, name), join(outRoot, name));
}

const piPackage = JSON.parse(await readFile(join(piRoot, "package.json"), "utf8"));
const shellockPackage = {
  ...piPackage,
  name: "@shellock/pi-core",
  private: true,
  description: "Shellock distribution core built on Pi coding-agent.",
  bin: {
    shellock: "dist/cli.js",
  },
  piConfig: {
    name: "shellock",
    configDir: ".shellock",
  },
  shellockCore: {
    upstreamPackage: "@earendil-works/pi-coding-agent",
    upstreamVersion: piPackage.version,
    distribution: "pi-family",
  },
};

await writeFile(join(outRoot, "package.json"), `${JSON.stringify(shellockPackage, null, 2)}\n`, "utf8");
