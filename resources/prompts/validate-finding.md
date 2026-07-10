---
description: Validate or reject a candidate security finding from the case file
argument-hint: "<finding id or file>"
---

Validate `$ARGUMENTS` from the current security case file.

Read the finding, linked evidence, `STATE.md`, `SURFACE.md`, and `COVERAGE.md`. Determine what is directly observed, what is inferred, what remains unproven, and what evidence would disprove the claim.

Update the finding status to `validated`, `rejected`, or `unresolved`. Use `validated` only when the finding has direct evidence links, specific affected assets, repeatable reproduction, demonstrated impact, confidence, and actionable remediation. If it remains unresolved, write the next concrete validation step and blocker. If the evidence disproves it, mark it `rejected` and preserve the disconfirming evidence.
