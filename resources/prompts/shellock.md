---
description: Start or continue an authorized Shellock mission
argument-hint: "[mission or next objective]"
---

Use the Shellock discipline for this mission:

$ARGUMENTS

This prompt means the user explicitly wants mission work. Inspect the case file in the current working directory before acting. If `MISSION.md` is missing, ask for the authorized mission boundary or suggest `/shellock-init <mission>` before doing assessment work. Use `STATE.md`, `SURFACE.md`, `COVERAGE.md`, `THREAT_MODEL.md`, `COMMANDS.md`, `hypotheses/`, `findings/`, and `evidence/` as the durable context.

Do not create a separate agent loop. Use Pi's normal tools and terminal access. If an Incus runtime is active, treat Pi's `bash` tool as the runtime shell.

Findings must move through lead -> candidate -> validated/rejected. Do not mark a finding validated from scanner output alone. Report generation includes only validated/reported findings that pass the evidence gate.
