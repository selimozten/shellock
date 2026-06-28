import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MissionWorkspace } from "../types.js";
import { hypothesisTemplate } from "./templates.js";

export async function createHypothesis(
  workspace: MissionWorkspace,
  title: string,
  id?: string,
): Promise<string> {
  const hypothesisId = id ?? nextHypothesisId(await existingHypothesisCount(workspace));
  const safeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  await mkdir(workspace.hypothesesDir, { recursive: true });
  const path = join(workspace.hypothesesDir, `${hypothesisId}-${safeTitle || "hypothesis"}.md`);
  await writeFile(path, hypothesisTemplate(hypothesisId, title), "utf8");
  return path;
}

async function existingHypothesisCount(workspace: MissionWorkspace): Promise<number> {
  const entries = await readdir(workspace.hypothesesDir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
}

function nextHypothesisId(existingCount: number): string {
  return `HYP-${String(existingCount + 1).padStart(3, "0")}`;
}
