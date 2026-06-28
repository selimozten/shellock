# Implementation Plan

Shellock starts as a Pi-family security operations agent harness, not an MVP wrapper around Pi.

## Non-Negotiable Product Shape

```text
shellock interactive terminal
-> copied Shellock-branded Pi core
-> Shellock built-in extension
-> security skills and prompt templates
-> optional Incus/LXC/VM-like runtime for bash
-> markdown case file as durable agent context
-> evidence artifacts
-> run manifests
-> runtime/tool doctor
-> finding files
-> report generation
```

Pi owns the agent loop, session tree, model calls, tool execution model, editor, and terminal chat experience. Shellock vendors that core and extends Pi where Pi already has extension points.

Shellock should evolve like an Oh My Pi-style distribution/fork: publish as `@shellock/pi-coding-agent`, expose the `shellock` binary, track Pi regularly, copy or vendor the core during build, keep Shellock-specific behavior in extensions, skills, prompts, runtime images, and case-file utilities, and avoid maintaining a parallel terminal harness.

The build and tests guard this architecture. If Shellock starts adding its own agent loop, provider/model abstraction, broad per-tool wrappers, or extra public helper binaries, that is product drift unless Pi lacks an extension point and the product cannot work without it.

## What We Build

1. Shellock distribution launcher
   - `shellock` calls Pi's own `main()` from a copied Shellock-branded Pi core.
   - Pins the Pi core dependency as a runtime dependency for reproducible distribution installs.
   - Records the upstream Pi package/version in the copied core.
   - Verifies the copied Pi `dist/`, README, and changelog byte-for-byte against upstream.
   - Creates `~/.shellock/agent` without silently copying `~/.pi/agent` credentials.
   - Does not copy Pi enabled-model filters or custom model registry entries; Shellock uses Pi's current model registry.
   - Reuses Pi's provider/login/model-selection flows through `/login`, env vars, `/model`, and `--model`.
   - Does not define a Shellock-specific default provider/model; Shellock should not silently pin a paid model path.
   - Ships Shellock terminal branding through launcher-seeded themes and Pi extension UI hooks, not by patching Pi core.
   - Injects Shellock extensions as built-ins, so no `pi install` step is required.

2. Shellock extension
   - Appends red team, blue team, OPSEC, DevSecOps, penetration testing, and security research discipline to Pi's system prompt.
   - Exposes native slash commands: `/shellock-init`, `/shellock-status`, `/shellock-report`, `/shellock-runtime`.
   - Exposes `/shellock-doctor` for config/runtime/tool-profile checks.
   - Maintains the markdown case-file skeleton when a mission exists.
   - Records agent bash runs under `evidence/runs/RUN-*`.
   - Loads Shellock skills and prompts through the built-in extension.

3. Incus bash extension
   - If `SHELLOCK_INCUS_INSTANCE` is set, replaces Pi's normal `bash` tool with an Incus-backed shell.
   - If not set, leaves Shellock's local bash behavior alone.
   - Maps host workspace paths to `/workspace` or `SHELLOCK_WORKSPACE_GUEST`.

4. Case-file utilities inside the agent
   - `/shellock-init`
   - `/shellock-status`
   - `/shellock-report`
   - `/shellock-doctor`
   - `/shellock-runtime bootstrap/status/create/start/attach/detach/stop/snapshot/restore/destroy`
   - normal Pi chat/tool use for hypotheses, findings, reports, and runtime work

## What We Do Not Build First

- A separate agent loop
- A separate interactive shell
- A web UI
- Billing or dashboard surfaces
- A SQLite evidence store
- One MCP wrapper per security tool

The runtime image should contain the tools. Pi already has terminal access and the model already knows how to use normal Linux tooling.

## Runtime Direction

Default runtime:

- Incus system container
- unprivileged
- `/workspace` mounted from the mission workspace
- NAT networking by default
- disposable root filesystem
- persistent markdown workspace
- bundled profiles: `base`, `net-basic`, `net-advanced`, `lab`

High-isolation runtime:

- Incus VM with the same `/workspace` contract
- bundled profile: `vm-danger`

macOS host:

- a Linux VM can host Incus when needed
- Pi still runs locally and routes bash into the runtime

Runtime lifecycle is managed inside the same Pi terminal session through `/shellock-runtime`; Shellock should not grow a separate helper CLI for this.

Runtime bootstrap should also stay in the same session. `/shellock-runtime bootstrap` prepares bundled Incus profiles and the Shellock runtime image; `/shellock-runtime create` consumes those assets to create a disposable session. `/shellock-runtime attach` switches bash execution in the current Pi session to the runtime, and `/shellock-runtime detach` returns it to local bash.

Runtime doctor checks should distinguish valid local mode from hands-on isolated mode: local bash may warn about missing Incus, but an attached runtime must fail doctor if Incus or the mounted workspace is unreachable.

Tool checks should be profile-aware. `base` should not warn about every possible offensive or specialist tool; `lab` and `vm-danger` should expect broader tooling. Modern security release tools such as nuclei, gitleaks, trufflehog, syft, grype, ffuf, and semgrep are installed with pins but remain recommended checks because missions may not need every specialist tool.

The runtime image should install modern release tools with explicit version pins and checksum verification. Floating installers such as `@latest` are not acceptable for the production image.

The normal check/test path should validate the runtime image recipe without requiring an Incus build. The verifier extracts the embedded installer from `images/incus/shellock.yaml`, runs shell syntax checks, enforces pins, rejects floating versions, and checks that release archive installers use upstream checksum files.

## Evidence Discipline

The case file is the product's durable memory:

- `MISSION.md`: scope and objective
- `STATE.md`: phase, active hypothesis, blockers, next actions
- `SURFACE.md`: assets, services, technologies, trust boundaries
- `COVERAGE.md`: tested, not tested, limitations
- `THREAT_MODEL.md`: assets, actors, entry points, trust boundaries, threats, controls, assumptions
- `COMMANDS.md`: meaningful command intent and outcome
- `hypotheses/`: falsifiable ideas
- `findings/`: lead through validated finding lifecycle
- `evidence/`: raw artifacts
- `evidence/runs/`: command manifests and output previews
- `reports/`: generated deliverables

Scanner output is a lead. A finding needs direct evidence, affected assets, reproduction, impact, confidence, and remediation before promotion.
