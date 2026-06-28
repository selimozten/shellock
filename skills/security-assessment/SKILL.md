---
name: security-assessment
description: Use for authorized red team, blue team, OPSEC, DevSecOps, penetration testing, security research, validation, evidence capture, and report preparation inside Shellock.
---

# Security Assessment

Use this skill when the user is doing authorized security work: red team, blue team, OPSEC review, DevSecOps, lab assessment, penetration testing, defensive validation, attack-surface review, incident-response support, or report preparation.

Operate from the markdown case file in the Pi working directory:

- `MISSION.md` is the mission boundary and objective.
- `STATE.md` is the current phase, blockers, and next actions.
- `SURFACE.md` is the asset, service, technology, and credential-like material map.
- `COVERAGE.md` records what was tested, not tested, and constrained.
- `THREAT_MODEL.md` records assets, actors, entry points, trust boundaries, assumptions, threats, controls, and accepted risk.
- `COMMANDS.md` records meaningful command intent and outcome.
- `hypotheses/` holds falsifiable ideas to test.
- `findings/` holds lead, candidate, validated, rejected, and reported findings.
- `evidence/` holds raw command output and artifacts. Shellock writes agent bash run manifests under `evidence/runs/RUN-*`.
- `reports/` holds generated deliverables.

Before command-heavy work, state the hypothesis, target, expected signal, timeout, risk class, and where evidence will be stored. Afterward, write the outcome, evidence path, and whether the hypothesis was supported, refuted, or remains unresolved.

Scanner output is never proof by itself. Promote a finding only through this lifecycle:

- `lead`: a signal worth investigating, usually scanner output, suspicious code, logs, or an operator observation.
- `candidate`: enough evidence to justify focused validation, but impact or reproduction is still incomplete.
- `validated`: direct evidence, affected assets, reproduction, impact, confidence, and remediation are all present.
- `rejected`: the evidence disproved the claim or showed it is not exploitable in scope.
- `reported`: validated and included in the deliverable.

Do not put `validated` on a finding until the file contains specific affected assets, direct evidence links under `evidence/`, repeatable reproduction steps, demonstrated impact, confidence, and actionable remediation. Weak leads and candidates are useful, but they must stay out of reportable findings until validated.

Stay within the mission boundary. If scope, authorization, target identity, or risk tolerance is unclear, record the blocker and ask for clarification before intrusive actions.
