---
name: case-file
description: Use when creating, updating, or repairing the markdown mission workspace used as durable agent context.
---

# Case File

The case file is the durable context store. Prefer clear markdown updates over hidden state or a database unless the user explicitly asks for another store.

Keep files short enough to scan and structured enough for recursive agent reads:

- `STATE.md`: current phase, active hypothesis, validated findings, open candidates, blockers, next best actions.
- `SURFACE.md`: assets, services, technologies, trust boundaries, credentials or sensitive material observed.
- `COVERAGE.md`: tested paths, untested paths, limitations, negative results.
- `THREAT_MODEL.md`: assets, actors, entry points, trust boundaries, assumptions, threats, controls, accepted risk.
- `COMMANDS.md`: command intent, risk class, timeout, evidence artifact path, and outcome.
- `hypotheses/*.md`: rationale, expected signal, evidence, and status.
- `findings/*.md`: status, severity, confidence, validation gate, affected assets, summary, impact, evidence, reproduction, remediation, open questions.
- `evidence/runs/RUN-*`: Shellock-created command manifests and output previews.

Raw tool output belongs in `evidence/`. Durable claims belong in markdown with links back to raw artifacts.

Reportable findings must be `validated` or `reported` and must contain direct evidence links, specific affected assets, repeatable reproduction, demonstrated impact, confidence, and actionable remediation. Keep scanner-only or incomplete claims as `lead`, `candidate`, or `unresolved`.

When updating files, separate observed facts, inferences, assumptions, and unresolved leads. Do not bury blockers in chat history; put them in `STATE.md` and `COVERAGE.md`.
