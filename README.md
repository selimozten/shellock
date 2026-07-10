# Shellock

Shellock is a Pi-family terminal agent harness for security research and engineering. It keeps Pi's interactive agent loop, model providers, subscriptions, sessions, approvals, and native tools, then adds:

- security-oriented system guidance and discoverable skills
- a curated Linux security-tool runtime
- optional Incus system-container and VM isolation
- runtime and environment diagnostics
- restrained Shellock terminal branding

Shellock does not implement another agent loop, force a case-file workflow, require a fixed report schema, or wrap every CLI utility as an MCP tool.

## Product Shape

```text
shellock terminal
  -> pinned Pi coding-agent core
  -> Shellock prompt and skills
  -> native read / write / edit / bash tools
  -> normal local or isolated CLI environment
  -> optional Incus/LXC/VM runtime
```

The model works from the user's request and the current workspace. Specialized repeatable procedures, such as repository-wide security scanning, belong in skills that the model can discover and load when relevant.

## Core Contract

- Pi owns the chat loop, tools, sessions, compaction, providers, subscriptions, API keys, model selection, and approvals.
- Shellock ships a pinned Pi core and injects focused behavior through supported extension APIs.
- The copied Pi distribution remains byte-for-byte identical to the pinned upstream package.
- Shellock keeps its own `~/.shellock/agent` settings, credentials, models, packages, themes, and sessions.
- Shellock never reads or writes `~/.pi/agent`.
- Security programs remain ordinary terminal tools. The agent discovers and uses them through `bash` instead of needing one custom wrapper per program.
- Skills provide deeper workflows without making every conversation follow the same process.

Run `npm run verify:pi-core` to verify this contract.

## Tool Model

Pi gives Shellock four durable primitives:

- `read` for file inspection
- `write` for creating or intentionally replacing files
- `edit` for targeted changes
- `bash` for commands, tests, package managers, scanners, debuggers, and runtime operations

The local machine or Shellock runtime supplies the broader toolset. The model can inspect installed commands, read tool help, use project manifests, load relevant skills, and select the tools appropriate to the task.

## Install Locally

```bash
npm install
npm run build
npm link
shellock
```

The eventual global install shape is:

```bash
npm install -g @shellock/pi-coding-agent
shellock
```

`shellock --help` and `shellock --version` are side-effect free. A normal first run creates `~/.shellock/agent` with isolated settings and bundled themes.

## Models And Auth

Use Pi's normal provider paths:

- `/login` for supported subscriptions and provider authentication
- `/model` or `Ctrl+L` to switch models
- `--model provider/model` for one run
- provider environment variables such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `TOGETHER_API_KEY`

Shellock does not pin a paid provider or silently copy Pi credentials. Resumed sessions may retain their session-local model until changed.

## Skills

Skills are loaded from `resources/skills/` and surfaced through Pi's native skill discovery. They describe specialized workflows while leaving tool choice and execution to the model.

Current skill areas include focused security assessment and Incus runtime operation. Ask Shellock for the task directly; explicit slash commands are not required to activate a relevant skill.

## Incus Runtime

Shellock can replace Pi's local `bash` execution with a disposable Incus system container or VM while keeping the current workspace mounted at `/workspace`.

```bash
export SHELLOCK_INCUS_INSTANCE=shellock-lab
export SHELLOCK_WORKSPACE_HOST="$PWD"
export SHELLOCK_WORKSPACE_GUEST=/workspace
shellock
```

Runtime lifecycle operations remain available inside the conversation:

```text
/shellock-runtime
/shellock-runtime bootstrap
/shellock-runtime create shellock-lab --profile net-basic
/shellock-runtime create shellock-vm --vm --profile lab
/shellock-runtime start shellock-lab
/shellock-runtime attach shellock-lab
/shellock-runtime snapshot shellock-lab clean
/shellock-runtime restore shellock-lab clean
/shellock-runtime detach
/shellock-runtime stop shellock-lab
/shellock-runtime destroy shellock-lab
```

Bundled profiles:

- `base`: shell, Git, curl, Python, jq, and ripgrep
- `net-basic`: base plus common reconnaissance tools
- `net-advanced`: broader web and network tooling
- `lab`: binary, forensics, and general research tooling
- `vm-danger`: VM-oriented profile for high-risk lab work

The image pins modern tools including nuclei, gitleaks, trufflehog, syft, grype, ffuf, and semgrep. Run `/shellock-doctor` to inspect runtime assets and profile-aware tool availability.

For command-flow testing without Incus:

```bash
SHELLOCK_RUNTIME_PROVIDER=dry-run shellock
```

## Safety

Use local execution for trusted code review, documentation, and low-risk development. Use a disposable container or VM for untrusted binaries, exploit development, malware-like behavior, or intrusive network testing.

The current repository, supplied files, and explicit local lab resources are treated as authorized for ordinary analysis. External targets and intrusive or destructive actions still require clear authorization and boundaries.

## Verification

```bash
npm test
npm run verify:pi-core
npm run verify:runtime-image
npm run verify:pack-install
```

See [docs/product-direction.md](docs/product-direction.md) for architecture and product boundaries.
