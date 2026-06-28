import type { FindingDraft } from "../types.js";

export function missionTemplate(mission: string): string {
  return `# Mission

${mission.trim()}

## Objective

Interpret the mission, identify the target surface, validate real security findings, and produce a reproducible report.

## Operator Notes

- This file is the source mission text.
- The agent should update STATE.md after interpreting the mission.
`;
}

export function stateTemplate(): string {
  return `# State

## Current Phase

mission-intake

## Runtime

- mode: unknown
- workspace: current directory
- constraints: authorization and scope from MISSION.md

## Active Hypothesis

None yet.

## Action Queue

1. Interpret MISSION.md.
2. Build initial target inventory.
3. Create falsifiable hypotheses before deep testing.

## Validated Findings

None yet.

## Open Candidates

None yet.

## Blocked Items

None.

## Next Best Actions

1. Interpret MISSION.md.
2. Inspect the runtime and available security tools when execution is needed.
3. Build initial target inventory.
`;
}

export function surfaceTemplate(): string {
  return `# Surface

## Assets

No assets discovered yet.

## Services

No services discovered yet.

## Technologies

No technologies identified yet.

## Entry Points

No entry points mapped yet.

## Trust Boundaries

No trust boundaries mapped yet.

## Credentials And Sensitive Material

No credential-like material recorded.
`;
}

export function coverageTemplate(): string {
  return `# Coverage

## Tested

Nothing tested yet.

## Reviewed

No source, binary, endpoint, package, or configuration review recorded yet.

## Not Tested

Unknown.

## Limitations

None recorded.

## Evidence Links

- None
`;
}

export function commandsTemplate(): string {
  return `# Commands

Agent-maintained record of meaningful commands, intent, evidence paths, and outcomes. Pi owns command execution; this file is part of the human-readable case file.

Use one section per meaningful command or tool run. Raw output belongs under \`evidence/\`; durable conclusions belong in \`STATE.md\`, \`COVERAGE.md\`, \`SURFACE.md\`, \`THREAT_MODEL.md\`, or \`findings/\`.

`;
}

export function threatModelTemplate(): string {
  return `# Threat Model

## Assets

- None mapped yet.

## Actors

- Authorized assessor
- Unknown target users/operators

## Entry Points

- None mapped yet.

## Trust Boundaries

- None mapped yet.

## High-Risk Assumptions

- None recorded.

## Threats

| ID | Threat | Status | Evidence |
| --- | --- | --- | --- |
| T-001 | Initial threat model not built yet | needs-evidence | None |

## Controls And Mitigations

- None mapped yet.

## Accepted Risk

- None.

## Notes

Keep this file operator-editable. Change threat state only when evidence changes, not when wording changes.
`;
}

export function hypothesisTemplate(id: string, title: string): string {
  return `# ${id}: ${title}

status: untried

## Rationale

Describe why this hypothesis matters.

## Expected Signal

Describe what would support or refute it.

## Evidence

None yet.
`;
}

export function findingTemplate(finding: FindingDraft): string {
  return `# ${finding.id}: ${finding.title}

status: ${finding.status}
severity: ${finding.severity}
confidence: ${finding.confidence}

## Validation Gate

- status must be \`validated\` or \`reported\` for report inclusion
- affected assets must be specific
- evidence must link to direct observations under \`evidence/\`
- reproduction must be independently repeatable
- impact must describe demonstrated security consequence
- remediation must be actionable
- scanner output alone is never enough

## Affected Assets

${listOrNone(finding.affectedAssets)}

## Summary

${finding.summary}

## Impact

${finding.impact}

## Evidence

${listOrNone(finding.evidenceLinks)}

## Reproduction

${orderedOrNone(finding.reproduction)}

## Severity Rationale

Severity is based on demonstrated exploitability, impact, exposure, privileges required, user interaction, and confidence. Scanner severity alone is not sufficient.

## Remediation

${finding.remediation}

## Open Questions

${listOrNone(finding.openQuestions)}
`;
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function orderedOrNone(items: string[]): string {
  return items.length > 0 ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : "1. None";
}
