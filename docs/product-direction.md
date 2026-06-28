# Product Direction

Shellock is a Pi-family security operations agent harness.

## Positioning

Shellock should feel like a focused Pi distribution/fork rather than a separate agent platform. Its package identity is `@shellock/pi-coding-agent`, with `shellock` as the terminal binary. Pi owns the terminal chat loop, provider subscriptions, API keys, model switching, sessions, approvals, tools, editor, and extension runtime. Shellock owns the security operations layer.

This is an Oh My Pi-style stance: stay close to Pi core, inherit Pi's fast-moving model/provider/tool capabilities, and add a focused security pack on top. Agent-core capabilities and model surfaces change quickly; Shellock should not fork those concerns unless Pi lacks an extension point and the product cannot work without it.

Primary operator modes:

- Red team and adversary emulation
- Blue team validation and detection engineering support
- OPSEC review
- DevSecOps and secure engineering review
- Penetration testing and lab assessment
- Vulnerability research and exploitability validation
- Incident-response support and forensic triage

## Auth And Models

Do not build a separate auth system. Shellock should reuse Pi's model access paths:

- Pi-supported subscription login through `/login`
- Provider API keys and tokens through environment variables or stored Pi auth
- `/model`, `Ctrl+L`, and `--model provider/model` for selection

Shellock may set opinionated defaults, but it should never make Together, Claude, Codex, OpenAI, Anthropic, or any other provider the only viable path. Shellock keeps its own `~/.shellock/agent` store and does not silently duplicate credentials, custom model registries, or enabled-model filters from `~/.pi/agent`.

## Core Drift Guardrails

- Pin the Pi core dependency used to build Shellock so distribution builds are reproducible.
- Keep Pi as a pinned runtime dependency so installed Shellock distributions bring the upstream core they delegate to.
- Mirror Pi's direct runtime dependencies and avoid adding unrelated runtime libraries around the core.
- Copy/vendor Pi during build instead of reimplementing the terminal agent.
- Verify copied Pi `dist/`, README, and changelog byte-for-byte against upstream; Shellock may brand metadata and inject extensions, but it must not patch Pi core in place.
- Inject Shellock through Pi extensions, skills, prompts, and runtime images.
- Verify that Shellock exposes only the `shellock` binary and does not reintroduce helper CLIs such as `shellock-case`.
- Prefer normal runtime CLI tools over one custom wrapper per security tool.

## Interaction Contract

Shellock should behave like a terminal agent, not an autonomous batch runner.

- Casual conversation stays conversational.
- Mission work starts when the user explicitly asks for it, invokes `/shellock`, or creates a mission.
- A fresh directory does not get case files silently.
- `/shellock-init <authorized mission>` creates the case file.
- If `MISSION.md` exists, Shellock can repair missing supporting files without overwriting user content.
- The agent should ask for scope and authorization before intrusive commands unless the case file and latest user request already make them clear.

## Safe Runtime Guidance

Shellock should teach safe operating patterns:

- Use a disposable Incus/LXC runtime by default for hands-on security work.
- Use a VM for higher-risk targets, malware-like behavior, or exploit execution.
- Use a spare laptop/lab host if the user cannot run containers/VMs.
- Use local mode only for low-risk analysis, code review, docs, reporting, and trusted commands.

Model assessment should track refusal rate, over-refusal on authorized tasks, unsafe compliance, evidence quality, tool-use discipline, and scope adherence.

## Build Shape

The sustainable shape is:

```text
Pi core copied or vendored during build
-> Shellock-branded CLI
-> Shellock built-in extensions
-> security skills and prompt packs
-> markdown case file
-> evidence/run ledger
-> Incus/LXC/VM runtime profiles and images
-> report/finding utilities inside the Shellock agent
```

Avoid:

- A second agent loop
- A second terminal UI
- A web dashboard before the terminal product is excellent
- Per-tool MCP wrappers when the runtime image can provide normal CLI tools
- A database for state that the agent can maintain as readable markdown
- A second public helper CLI for case-file operations

## Regular Improvement Loop

Regular work should follow this order:

1. Track upstream Pi and update the copied core.
2. Keep Shellock extensions compatible with Pi's extension API.
3. Improve the runtime image and profiles.
4. Expand skills and prompts for specific security operator workflows.
5. Improve evidence, findings, threat model, coverage, and reporting.
6. Add tests around product contracts before adding UI surface area.

The core promise is a terminal-native security operator harness with durable evidence and normal Linux tooling.
