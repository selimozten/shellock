# Product Direction

Shellock is a Pi-family terminal agent harness for security research and engineering.

## Positioning

Shellock should feel like a capable terminal agent with unusually strong security tooling, skills, and runtime isolation. It is not a case-management application and should not force users through Shellock-specific ceremony before the model can work.

Primary domains include offensive and defensive security, OPSEC, DevSecOps, penetration testing, vulnerability research, incident response, forensics, and secure software engineering. General coding work remains fully supported.

## Core Ownership

Pi owns:

- agent and tool loops
- terminal interaction and approvals
- sessions and compaction
- model providers, subscriptions, credentials, and selection
- native read, write, edit, and bash tools

Shellock owns:

- focused security system guidance
- discoverable security and runtime skills
- a curated Linux tool environment
- Incus/LXC/VM execution profiles
- terminal identity and concise runtime status
- compatibility fixes that Pi cannot yet express correctly upstream

## Interaction Contract

- Respond naturally to conversation and act directly on work requests.
- Do not require mission files, scope files, case directories, report templates, or command rituals.
- Use skills for repeatable specialized workflows, including repository-wide scans.
- Let the model select and discover CLI tools from the environment.
- Create artifacts when they help the task or the user asks for them.
- Treat supplied repositories and local lab resources as authorized for ordinary work.
- Confirm authorization before external-target exploitation, intrusive network activity, destructive operations, or unclear third-party scope.

## Tool Strategy

The default tool surface stays small and durable: read, write, edit, and bash. Broader capability comes from the environment rather than hundreds of bespoke wrappers.

The runtime image should contain a practical set of security, reverse-engineering, network, web, cloud, supply-chain, and forensic CLI tools. Skills should teach discovery and sound workflows without hard-coding one command sequence for every repository.

## Auth And Models

Shellock uses Pi's provider and authentication paths while keeping all state under `~/.shellock/agent`. It never reads or writes `~/.pi/agent` and never silently pins a paid provider.

Provider compatibility fixes should use Pi extension points when possible. Avoid a second provider abstraction or hidden credential store.

## Runtime Strategy

- Local bash for trusted development and low-risk analysis
- Disposable Incus system containers for common hands-on research
- Incus VMs for untrusted binaries, exploit development, malware-like behavior, and higher isolation
- Normal CLI tools inside the runtime rather than MCP wrappers for every utility

## Drift Guardrails

- Pin and regularly update the upstream Pi dependency.
- Verify copied Pi artifacts byte-for-byte.
- Keep Shellock behavior in extensions, skills, prompts, and runtime assets.
- Add a core patch only when no supported extension point can deliver required behavior.
- Verify installed-package behavior, not only source-tree tests.

## Improvement Order

1. Keep the upstream harness and model/provider surface current.
2. Improve tool availability and runtime images.
3. Build high-quality security skills for repeatable work.
4. Improve terminal ergonomics without obscuring the transcript.
5. Add focused compatibility and reliability tests.

The core promise is a fast terminal-native agent with strong security judgment, a deep normal-CLI environment, and optional VM-like isolation.
