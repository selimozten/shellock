import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MissionWorkspace } from "../types.js";
import { readFindingQualities } from "./findings.js";

export async function generateReport(workspace: MissionWorkspace): Promise<string> {
  const [mission, state, surface, coverage, threatModel, findings] = await Promise.all([
    readFile(workspace.missionFile, "utf8"),
    readFile(workspace.stateFile, "utf8"),
    readFile(workspace.surfaceFile, "utf8"),
    readFile(workspace.coverageFile, "utf8"),
    readFile(workspace.threatModelFile, "utf8"),
    readFindingQualities(workspace.findingsDir),
  ]);
  const reportableFindings = findings.filter((finding) => finding.reportable);
  const blockedFindings = findings.filter((finding) => !finding.reportable);

  const report = `# Security Assessment Report

## Executive Summary

This report is generated from the mission workspace. Only validated/reported findings with direct evidence, impact, affected assets, reproduction, confidence, and remediation are included as report findings. Raw command output remains under \`evidence/\`.

## Mission

${stripHeading(mission)}

## Current State

${stripHeading(state)}

## Surface

${stripHeading(surface)}

## Coverage

${stripHeading(coverage)}

## Threat Model

${stripHeading(threatModel)}

## Validated Findings

${reportableFindings.length > 0 ? reportableFindings.map((finding) => finding.markdown).join("\n\n---\n\n") : "No validated findings meet the reporting gate yet."}

## Non-Reportable Leads And Candidates

${blockedFindings.length > 0 ? blockedFindings.map(formatBlockedFinding).join("\n") : "No unvalidated leads or candidates are currently tracked."}

## Appendix

- Command journal: \`COMMANDS.md\`
- Threat model: \`THREAT_MODEL.md\`
- Evidence directory: \`evidence/\`
- Scratch notes: \`scratch/\`
`;

  const reportPath = join(workspace.reportsDir, "REPORT.md");
  await writeFile(reportPath, report, "utf8");
  return reportPath;
}

function stripHeading(markdown: string): string {
  return markdown.replace(/^# .+\n+/, "").trim();
}

function formatBlockedFinding(finding: { id: string; title: string; file: string; blockers: string[] }): string {
  return [
    `- ${finding.id}: ${finding.title} (${finding.file})`,
    `  - blocked: ${finding.blockers.join("; ")}`,
  ].join("\n");
}
