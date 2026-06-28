# Shellock

Shellock is a Pi-family security operations agent harness. It follows the same distribution pattern as Pi packages/forks such as Oh My Pi: Pi remains the interactive terminal agent core and owns the chat loop, sessions, tools, approvals, subscriptions, API keys, model selection, and terminal experience. Shellock publishes as `@shellock/pi-coding-agent` and ships that core as its own `shellock` CLI with the security operator layer built in:

- red team, blue team, OPSEC, DevSecOps, penetration-testing, and security-research system prompt
- Pi skills and prompt templates
- markdown case-file workspace
- finding and report helpers
- doctor checks for config/runtime/tooling
- optional Incus-backed bash runtime

No separate agent loop, web UI, SQLite evidence store, or MCP wrapper for every security tool.

## Product Shape

```text
shellock interactive terminal
  -> copied Shellock-branded Pi core
  -> Shellock extension
  -> security skills and prompt templates
  -> optional Incus bash override
  -> markdown case file in the current working directory
  -> evidence artifacts and reports
```

The core experience is still Pi's terminal agent. Shellock changes the product defaults, built-in behavior, runtime contract, and security methodology, not the agent loop.

## Core Contract

Shellock must stay close to Pi:

- Pi owns model providers, subscriptions, API keys, `/login`, `/model`, sessions, approvals, and terminal interaction.
- Shellock is a scoped Pi coding-agent distribution package, not a separate shell wrapper.
- Shellock vendors a pinned Pi core during build and injects behavior through Pi extension factories.
- The vendored Pi `dist/`, README, and changelog must remain byte-for-byte identical to upstream; only the copied package metadata is Shellock-branded.
- Pi is a pinned runtime dependency, so an installed Shellock package brings the upstream Pi runtime it delegates to.
- Shellock mirrors Pi's direct runtime dependencies and should not add unrelated runtime libraries around the core.
- Shellock should not grow a second agent loop, separate provider layer, or custom model abstraction.
- Security tools should live in the runtime image as normal CLI tools whenever possible.
- Shellock's product surface is the security operator layer: prompts, skills, case-file discipline, finding quality gates, runtime profiles, and curated tool images.
- Shellock may brand the terminal experience through launcher-seeded themes and Pi extension UI hooks: startup header, terminal title, status text, working labels, and Shellock commands.

Run `npm run verify:pi-core` to check that this contract has not drifted.
`npm pack` and `npm publish` run `prepack`, which rebuilds Shellock and verifies the copied Pi core before producing an artifact.
The pack verifier also checks that the tarball exposes the distribution surface only: compiled `dist/`, prompts, skills, images, profiles, scripts, README, and the single `shellock` binary.

## Tool Use Contract

Shellock tells the model to use Pi's native file tools first:

- `read` for file contents and specific regions
- `grep`, `find`, and `ls` for locating files, symbols, strings, and paths
- `edit` for targeted modifications and `write` for new or intentional whole-file replacement
- `bash` for commands, tests, package managers, runtime operations, scanners, and security tools

The prompt explicitly discourages Python, Node, `awk`, `sed`, or shell snippets just to print file lines when Pi's native tools can answer directly. Destructive file operations still go through terminal access and must have clear user intent, mission need, or safe-cleanup justification.

## Install Locally

```bash
npm install
npm run build
npm link
```

The eventual package install shape mirrors OMP-style Pi distributions:

```bash
npm install -g @shellock/pi-coding-agent
shellock
```

The `shellock` CLI creates its own `~/.shellock/agent` config on first run. It does not copy credentials from `~/.pi/agent` automatically, and it does not copy Pi's provider/model defaults, enabled-model filters, or custom model registry entries. Shellock seeds its bundled terminal themes into `~/.shellock/agent/themes`, uses the `shellock-light/shellock-dark` auto theme pair for fresh settings, and hides thinking traces by default. Existing explicit settings are not overwritten. Shellock should not silently pin a paid provider or model; model selection remains Pi's job through `/login`, `/model`, provider environment variables, and `--model`.

## Models And Auth

Shellock intentionally delegates model access to Pi. Use any Pi-supported path:

- Existing subscription login: run `/login` inside Shellock and select a provider supported by Pi, such as Claude Pro/Max or ChatGPT Plus/Pro/Codex where available.
- API keys or tokens: set provider environment variables such as `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `TOGETHER_API_KEY`, or store keys through Pi's login/config flow.
- Existing Pi setup: use it as a reference, but Shellock keeps its own auth store. This avoids silently duplicating sensitive credentials.
- Together AI: use `/model` or `--model together/<model-id>` for any Together model that Pi currently lists. Shellock does not add custom model registry entries on top of Pi.

Use `/model` or `Ctrl+L` in the Shellock terminal to switch models. Use `--model provider/model` for a single run. A resumed Pi session may keep its session-local model until you switch it or start a fresh session.

Then start Shellock from a mission workspace or target repo:

```bash
mkdir -p missions/lab-001
cd missions/lab-001
shellock
```

Inside Shellock:

```text
/shellock-init Assess the authorized lab target and produce a reproducible report
/shellock-status
/shellock-doctor
/shellock Continue the assessment from the case file
```

Shellock does not silently create a case file in every directory. In a fresh workspace it loads the Shellock pack and waits for an explicit mission. `/shellock-init <authorized mission>` creates `MISSION.md` and the supporting case-file structure. If `MISSION.md` already exists, Shellock may repair missing supporting files without overwriting existing content.

To override the model for a run:

```bash
shellock --model together/zai-org/GLM-5.1
```

## Case File

The current Shellock working directory is the durable context store:

```text
MISSION.md
STATE.md
SURFACE.md
COVERAGE.md
THREAT_MODEL.md
COMMANDS.md
hypotheses/
findings/
evidence/
evidence/runs/
reports/
scratch/
```

Raw command output belongs under `evidence/`. Shellock records agent bash runs under `evidence/runs/RUN-*` with a manifest and output preview. Durable claims go into markdown files with links back to evidence.

## Safe Runtime Guidance

Choose the runtime based on risk:

- Best default: disposable Incus/LXC system container with the mission workspace mounted at `/workspace`.
- Higher isolation: Incus VM or another VM with the same workspace contract.
- Lab fallback: a spare laptop or old machine with no personal accounts, secrets, browser profile, or production access.
- Local mode: acceptable for code review and low-risk local analysis, but not for untrusted binaries, malware, exploit execution, or intrusive network testing.

For model assessment work, record refusal/over-refusal, tool-use quality, false positives, evidence discipline, and whether the model can stay inside the authorized scope.

## Finding Quality

Shellock treats scanner output and suspicious observations as leads, not finished findings. Finding files move through `lead`, `candidate`, `validated`, `rejected`, and `reported`.

`/shellock-report` includes only `validated` or `reported` findings that pass the evidence gate: specific affected assets, direct evidence links, repeatable reproduction, demonstrated impact, confidence, and actionable remediation. Leads and candidates remain visible in the report as non-reportable blocked work.

## Incus Runtime

If these variables are set before starting Shellock, the Incus extension replaces the normal `bash` tool with a runtime-backed shell:

```bash
export SHELLOCK_INCUS_INSTANCE=shellock-lab-001
export SHELLOCK_WORKSPACE_HOST="$PWD"   # optional; defaults to Shellock's cwd
export SHELLOCK_WORKSPACE_GUEST=/workspace
shellock
```

Without `SHELLOCK_INCUS_INSTANCE`, Shellock uses local bash.

Manage runtime sessions from inside the normal Pi chat:

```text
/shellock-runtime
/shellock-runtime bootstrap
/shellock-runtime bootstrap --no-image --profile net-basic
/shellock-runtime status
/shellock-runtime create shellock-lab --profile net-basic --image shellock-runtime
/shellock-runtime create shellock-vm --vm --profile lab
/shellock-runtime start shellock-lab
/shellock-runtime attach shellock-lab
/shellock-runtime detach
/shellock-runtime snapshot shellock-lab clean
/shellock-runtime restore shellock-lab clean
/shellock-runtime stop shellock-lab
/shellock-runtime destroy shellock-lab
```

For command-flow tests without Incus, start Shellock with `SHELLOCK_RUNTIME_PROVIDER=dry-run`.

`bootstrap` imports the bundled Incus profiles and builds/imports the bundled runtime image if the image alias is missing. It expects `incus` and `distrobuilder` on the host, unless `SHELLOCK_RUNTIME_PROVIDER=dry-run` is set.

`attach` switches Shellock's bash execution for the current session to the named Incus instance. `detach` returns the session to local Pi bash.

Bundled profiles are `base`, `net-basic`, `net-advanced`, `lab`, and `vm-danger`. `/shellock-doctor` checks that these assets are packaged and, when Incus is available, whether the selected `SHELLOCK_RUNTIME_IMAGE` and `SHELLOCK_RUNTIME_PROFILE` exist on the host.

Tool readiness is profile-aware:

- `base`: core shell, git, curl, Python, jq, ripgrep.
- `net-basic`: base plus basic recon tools.
- `net-advanced`: net-basic plus web and network support tools.
- `lab`: net-advanced plus binary and forensics tooling, with modern security tools treated as recommended.
- `vm-danger`: lab-oriented checks plus mobile tooling as recommended.

The runtime image pins modern release tools during build:

- `nuclei` 3.9.0
- `gitleaks` 8.30.1
- `trufflehog` 3.95.6
- `syft` 1.46.0
- `grype` 0.115.0
- `ffuf` 2.1.0
- `semgrep` 1.168.0

GitHub release archives are checked against upstream checksum files. Semgrep is installed into `/opt/semgrep` with an exact package version and linked into `/usr/local/bin`.

Validate the runtime image recipe without building an image:

```bash
npm run verify:runtime-image
```

This extracts the embedded installer, runs `bash -n`, checks pinned versions, rejects floating `latest` references, and verifies that release archive installs use checksum files.

## Smoke Test

From any repo or scratch workspace:

```bash
mkdir -p /tmp/shellock-pi-smoke
cd /tmp/shellock-pi-smoke
shellock --no-session -p "/shellock-init Assess the authorized local smoke workspace"
find . -maxdepth 2 -type f | sort
```

Expected files:

```text
COMMANDS.md
COVERAGE.md
MISSION.md
STATE.md
SURFACE.md
THREAT_MODEL.md
```

## Direction

See [docs/product-direction.md](docs/product-direction.md) for the Pi-family distribution strategy, supported operator modes, and the regular improvement loop.
