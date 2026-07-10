---
name: repository-security-scan
description: Performs comprehensive repository-wide security reviews across source, dependencies, secrets, configuration, infrastructure, CI, and supply-chain surfaces. Use when the user asks to scan, audit, assess, or review an entire repository for security issues.
---

# Repository Security Scan

## Goal

Review the whole repository with coverage appropriate to its actual stack. Use the available Shellock/Pi tools and normal CLI programs; this skill is a workflow, not a fixed command or scanner bundle.

## Workflow

1. Establish the repository root, current Git state, languages, frameworks, package managers, build systems, deployment targets, and generated/vendor boundaries.
2. Discover relevant installed tools with targeted checks such as `command -v`, `--help`, lockfile inspection, and package metadata. Do not install global tools or run every scanner blindly.
3. Map the attack surface: entry points, authentication and authorization, data stores, trust boundaries, network clients and servers, parsers, uploads, cryptography, subprocesses, secrets, CI/CD, containers, cloud/IaC, and privileged operations.
4. Build a scan plan that covers applicable layers:
   - secrets and credential exposure
   - dependency and supply-chain risk
   - static analysis and dangerous API usage
   - configuration, CI/CD, container, and infrastructure weaknesses
   - manual source-to-sink tracing for high-impact paths
   - tests or safe local reproduction for plausible findings
5. Run independent checks in parallel when they do not contend for files or shared state. Keep commands read-only unless the user asks for fixes.
6. Triage tool output against the actual code and configuration. Deduplicate equivalent signals and reject findings that lack a reachable path, affected asset, or meaningful impact.
7. Deepen the highest-risk candidates with direct code inspection, call-path tracing, configuration resolution, and focused reproduction.
8. Report findings first, ordered by severity and confidence, with exact locations, evidence, realistic impact, preconditions, and actionable remediation.
9. Finish with coverage: surfaces reviewed, tools used, exclusions, failed checks, and residual risk. Do not imply complete coverage when a tool was unavailable or a subsystem was not examined.

## Guardrails

- Treat the current repository and its local test fixtures as authorized for ordinary read-only analysis.
- Ask before contacting external targets, executing untrusted artifacts, using live credentials, exploiting services, or making destructive changes.
- Run untrusted builds, binaries, or exploit tests in the configured isolated runtime when available.
- Scanner output is a lead, not a finding. Validate important claims manually.
- Preserve existing user changes and avoid generated-file churn.
- Create a report file only when the user requests one; otherwise present the results directly.

## Example Triggers

- "Scan this repository for security issues."
- "Perform a repo-wide application security review."
- "Audit the codebase, dependencies, CI, and infrastructure."
- "Find exploitable vulnerabilities across this project."
