import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FindingDraft, MissionWorkspace } from "../types.js";
import {
  commandsTemplate,
  coverageTemplate,
  findingTemplate,
  missionTemplate,
  stateTemplate,
  surfaceTemplate,
  threatModelTemplate,
} from "./templates.js";

export function workspacePaths(root: string): MissionWorkspace {
  const absoluteRoot = resolve(root);
  return {
    root: absoluteRoot,
    missionFile: join(absoluteRoot, "MISSION.md"),
    stateFile: join(absoluteRoot, "STATE.md"),
    surfaceFile: join(absoluteRoot, "SURFACE.md"),
    coverageFile: join(absoluteRoot, "COVERAGE.md"),
    commandsFile: join(absoluteRoot, "COMMANDS.md"),
    threatModelFile: join(absoluteRoot, "THREAT_MODEL.md"),
    hypothesesDir: join(absoluteRoot, "hypotheses"),
    findingsDir: join(absoluteRoot, "findings"),
    evidenceDir: join(absoluteRoot, "evidence"),
    runsDir: join(absoluteRoot, "evidence", "runs"),
    reportsDir: join(absoluteRoot, "reports"),
    scratchDir: join(absoluteRoot, "scratch"),
  };
}

export async function initializeWorkspace(root: string, mission: string): Promise<MissionWorkspace> {
  const workspace = workspacePaths(root);
  await mkdir(workspace.root, { recursive: true });
  await Promise.all([
    mkdir(workspace.hypothesesDir, { recursive: true }),
    mkdir(workspace.findingsDir, { recursive: true }),
    mkdir(workspace.evidenceDir, { recursive: true }),
    mkdir(workspace.runsDir, { recursive: true }),
    mkdir(workspace.reportsDir, { recursive: true }),
    mkdir(workspace.scratchDir, { recursive: true }),
  ]);

  await writeFile(workspace.missionFile, missionTemplate(mission), "utf8");
  await writeFile(workspace.stateFile, stateTemplate(), "utf8");
  await writeFile(workspace.surfaceFile, surfaceTemplate(), "utf8");
  await writeFile(workspace.coverageFile, coverageTemplate(), "utf8");
  await writeFile(workspace.commandsFile, commandsTemplate(), "utf8");
  await writeFile(workspace.threatModelFile, threatModelTemplate(), "utf8");

  return workspace;
}

export async function readMissionWorkspace(root: string): Promise<MissionWorkspace> {
  const workspace = workspacePaths(root);
  await readFile(workspace.missionFile, "utf8");
  return workspace;
}

export async function writeFinding(workspace: MissionWorkspace, finding: FindingDraft): Promise<string> {
  const safeTitle = finding.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const path = join(workspace.findingsDir, `${finding.id}-${safeTitle || "finding"}.md`);
  await writeFile(path, findingTemplate(finding), "utf8");
  await mkdir(join(workspace.evidenceDir, finding.id), { recursive: true });
  return path;
}
