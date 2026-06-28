import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const REPORTABLE_STATUSES = new Set(["validated", "reported"]);

export interface FindingQuality {
  file: string;
  id: string;
  title: string;
  status: string;
  reportable: boolean;
  blockers: string[];
  markdown: string;
}

export async function readFindingQualities(findingsDir: string): Promise<FindingQuality[]> {
  const entries = await readdir(findingsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (file) => evaluateFindingMarkdown(file, await readFile(join(findingsDir, file), "utf8"))),
  );
}

export function evaluateFindingMarkdown(file: string, markdown: string): FindingQuality {
  const heading = /^#\s+([^:\n]+):?\s*(.*)$/m.exec(markdown);
  const id = heading?.[1]?.trim() || file.replace(/\.md$/, "");
  const title = heading?.[2]?.trim() || id;
  const status = fieldValue(markdown, "status").toLowerCase();
  const severity = fieldValue(markdown, "severity").toLowerCase();
  const confidence = fieldValue(markdown, "confidence").toLowerCase();
  const blockers: string[] = [];

  if (!REPORTABLE_STATUSES.has(status)) blockers.push(`status is ${status || "missing"}, not validated/reported`);
  if (!severity || severity === "info") blockers.push("severity is missing or informational");
  if (confidence !== "high" && confidence !== "medium") blockers.push(`confidence is ${confidence || "missing"}`);
  if (!hasMeaningfulList(section(markdown, "Affected Assets"))) blockers.push("affected assets are missing");
  if (!hasMeaningfulSection(section(markdown, "Summary"))) blockers.push("summary is missing");
  if (!hasMeaningfulSection(section(markdown, "Impact"))) blockers.push("impact is missing");
  if (!hasMeaningfulList(section(markdown, "Evidence"))) blockers.push("evidence links are missing");
  if (!hasMeaningfulOrderedList(section(markdown, "Reproduction"))) blockers.push("reproduction steps are missing");
  if (!hasMeaningfulSection(section(markdown, "Remediation"))) blockers.push("remediation is missing");

  return {
    file,
    id,
    title,
    status,
    reportable: blockers.length === 0,
    blockers,
    markdown,
  };
}

function fieldValue(markdown: string, field: string): string {
  const match = new RegExp(`^${escapeRegExp(field)}:\\s*(.+)$`, "im").exec(markdown);
  return match?.[1]?.trim() ?? "";
}

function section(markdown: string, heading: string): string {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im");
  return pattern.exec(markdown)?.[1]?.trim() ?? "";
}

function hasMeaningfulSection(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && normalized !== "none" && normalized !== "n/a" && normalized !== "unknown";
}

function hasMeaningfulList(value: string): boolean {
  return value
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line.startsWith("- ") && !isEmptyMarker(line.slice(2)));
}

function hasMeaningfulOrderedList(value: string): boolean {
  return value
    .split("\n")
    .map((line) => line.trim())
    .some((line) => /^\d+\.\s+/.test(line) && !isEmptyMarker(line.replace(/^\d+\.\s+/, "")));
}

function isEmptyMarker(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "none" || normalized === "n/a" || normalized === "unknown";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
