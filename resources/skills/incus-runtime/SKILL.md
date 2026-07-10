---
name: incus-runtime
description: Use when Shellock is executing commands through an Incus or LXC-like Linux runtime.
---

# Incus Runtime

Use this skill when `SHELLOCK_INCUS_INSTANCE` is set or the user asks about the runtime.

Pi remains the interactive agent. The runtime only changes where terminal commands execute:

- Pi's normal `bash` tool is replaced by the Incus bash extension.
- Host working directory maps to `SHELLOCK_WORKSPACE_GUEST`, default `/workspace`.
- The root filesystem should be disposable.
- The current workspace is persistent and mounted into the runtime.

Assume the runtime image already contains common assessment tooling. Prefer normal terminal commands over wrapping every tool as a custom MCP-style tool.

Use `/shellock-runtime` for lifecycle management when the user wants to bootstrap assets, create, inspect, attach, detach, snapshot, restore, start, stop, or destroy runtime sessions. Keep runtime management in the Pi conversation rather than asking for a separate helper CLI.

If the user has not prepared the runtime assets, run `/shellock-runtime bootstrap` before creating a session. Use `/shellock-runtime bootstrap --no-image --profile <profile>` when only profiles should be imported.

After creating and starting a session, use `/shellock-runtime attach <name>` before running assessment commands that should execute inside Incus. Use `/shellock-runtime detach` when returning to local bash.

Available bundled profiles:

- `base`: conservative default for code review and low-risk local analysis.
- `net-basic`: normal bridged network profile for authorized network assessment.
- `net-advanced`: larger bridged network profile for heavier network tooling.
- `lab`: heavier general research profile.
- `vm-danger`: VM-oriented profile for high-risk authorized lab work.

Use `/shellock-doctor` after attaching a runtime. Required tool groups should be fixed before hands-on work for that profile; recommended tools can be installed or recorded as task limitations when they are actually needed.

The bundled image installs pinned modern tools: nuclei 3.9.0, gitleaks 8.30.1, trufflehog 3.95.6, syft 1.46.0, grype 0.115.0, ffuf 2.1.0, and semgrep 1.168.0. If `/shellock-doctor` reports these missing in an attached runtime, rebuild the image instead of installing ad hoc unpinned copies.

When the user asks for a durable record, include the image, instance name, network posture, privilege posture, mounted workspace path, and relevant tool limitations in the requested artifact.
