---
name: security-assessment
description: Guides focused offensive, defensive, OPSEC, DevSecOps, penetration-testing, incident-response, and security-research tasks. Use when Shellock needs security-specific validation and judgment that is narrower than a repository-wide scan.
---

# Security Assessment

Use the tools available in the active environment. Start with targeted discovery (`command -v`, tool help, package metadata, project manifests) and choose the smallest set that can answer the question. Prefer native CLI tools over custom wrappers.

For each suspected issue:

1. Identify the asset, trust boundary, and attacker capability involved.
2. Separate direct observations from assumptions and scanner output.
3. Reproduce or trace the behavior with the least intrusive method that can establish impact.
4. Check relevant controls, mitigations, and realistic preconditions.
5. Report affected locations, evidence, impact, confidence, and specific remediation.

Scanner output is a lead, not proof. Do not claim exploitability or severity from a signature alone.

Treat the current repository, supplied files, and explicit local lab resources as authorized. Confirm scope before touching external targets, running intrusive network actions, exploiting systems, or performing destructive operations.

Do not create a case-file hierarchy or fixed report format unless the user asks for one. Match artifacts and depth to the task.
