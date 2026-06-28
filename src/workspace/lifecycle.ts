import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { MissionWorkspace } from "../types.js";
import { workspacePaths } from "./workspace.js";

const MAX_OUTPUT_BYTES = 200_000;

export interface RunStartInput {
  toolCallId: string;
  command: string;
  cwd: string;
  runtime: string;
}

export interface RunCompletionInput {
  isError: boolean;
  outputText: string;
  fullOutputPath?: string;
}

export interface ShellockRun {
  id: string;
  startedAt: string;
  command: string;
  cwd: string;
  runtime: string;
  runDir: string;
  manifestPath: string;
  outputPath: string;
}

export async function startRun(root: string, input: RunStartInput): Promise<ShellockRun> {
  const workspace = workspacePaths(root);
  const startedAt = new Date().toISOString();
  const id = runId(startedAt, input.toolCallId);
  const runDir = join(workspace.runsDir, id);
  const manifestPath = join(runDir, "manifest.md");
  const outputPath = join(runDir, "output.txt");

  await mkdir(runDir, { recursive: true });
  const run: ShellockRun = {
    id,
    startedAt,
    command: input.command,
    cwd: input.cwd,
    runtime: input.runtime,
    runDir,
    manifestPath,
    outputPath,
  };

  await writeFile(manifestPath, renderManifest(workspace, run, "running"), "utf8");
  return run;
}

export async function completeRun(root: string, run: ShellockRun, input: RunCompletionInput): Promise<void> {
  const workspace = workspacePaths(root);
  const completedAt = new Date().toISOString();
  const clipped = clipOutput(input.outputText);
  await writeFile(run.outputPath, clipped.text, "utf8");

  const status = input.isError ? "failed" : "completed";
  const completion: {
    completedAt: string;
    outputPath: string;
    fullOutputPath?: string;
    truncated: boolean;
  } = {
    completedAt,
    outputPath: relativePath(workspace, run.outputPath),
    truncated: clipped.truncated,
  };
  if (input.fullOutputPath) completion.fullOutputPath = input.fullOutputPath;

  await writeFile(
    run.manifestPath,
    renderManifest(workspace, run, status, completion),
    "utf8",
  );

  await appendFile(workspace.commandsFile, renderCommandEntry(workspace, run, status, completedAt), "utf8");
}

function runId(timestamp: string, toolCallId: string): string {
  const stamp = timestamp.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const tail = toolCallId.replace(/[^a-zA-Z0-9]+/g, "").slice(-8) || Math.random().toString(16).slice(2, 10);
  return `RUN-${stamp}-${tail}`;
}

function renderManifest(
  workspace: MissionWorkspace,
  run: ShellockRun,
  status: string,
  completion?: {
    completedAt: string;
    outputPath: string;
    fullOutputPath?: string;
    truncated: boolean;
  },
): string {
  const lines = [
    `# ${run.id}`,
    "",
    `status: ${status}`,
    `started_at: ${run.startedAt}`,
    completion ? `completed_at: ${completion.completedAt}` : undefined,
    `runtime: ${run.runtime}`,
    `cwd: ${run.cwd}`,
    `workspace: ${workspace.root}`,
    "",
    "## Command",
    "",
    "~~~bash",
    stripControl(run.command),
    "~~~",
    "",
    "## Output",
    "",
    completion ? `- preview: \`${completion.outputPath}\`` : "- preview: not written yet",
    completion?.fullOutputPath ? `- pi_full_output: \`${stripControl(completion.fullOutputPath)}\`` : undefined,
    completion?.truncated ? `- note: output preview clipped at ${MAX_OUTPUT_BYTES} bytes` : undefined,
    "",
    "## Assessment Notes",
    "",
    "- Outcome has not been interpreted yet.",
  ].filter((line): line is string => line !== undefined);

  return `${lines.join("\n")}\n`;
}

function renderCommandEntry(workspace: MissionWorkspace, run: ShellockRun, status: string, completedAt: string): string {
  return [
    `## ${run.id}`,
    "",
    `- status: ${status}`,
    `- completed_at: ${completedAt}`,
    `- runtime: ${run.runtime}`,
    `- cwd: ${run.cwd}`,
    `- evidence: \`${relativePath(workspace, run.manifestPath)}\``,
    "",
    "~~~bash",
    stripControl(run.command),
    "~~~",
    "",
  ].join("\n");
}

function clipOutput(output: string): { text: string; truncated: boolean } {
  const buffer = Buffer.from(output, "utf8");
  if (buffer.byteLength <= MAX_OUTPUT_BYTES) {
    return { text: output, truncated: false };
  }

  const clipped = buffer.subarray(0, MAX_OUTPUT_BYTES).toString("utf8");
  return {
    text: `${clipped}\n\n[Shellock clipped output preview at ${MAX_OUTPUT_BYTES} bytes.]\n`,
    truncated: true,
  };
}

function relativePath(workspace: MissionWorkspace, path: string): string {
  const rel = relative(workspace.root, path);
  return rel.startsWith("..") ? basename(path) : rel;
}

function stripControl(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "");
}
