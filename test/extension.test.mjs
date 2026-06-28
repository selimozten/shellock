import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import shellockExtension from "../dist/pi/extensions/shellock.js";

test("/shellock refuses mission work before a case file exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-ext-"));
  const harness = createExtensionHarness();
  shellockExtension(harness.pi);

  await harness.commands.get("shellock").handler("continue", createCommandContext(root, harness));

  assert.deepEqual(harness.sentMessages, []);
  assert.match(harness.notifications.at(-1).message, /No MISSION\.md found/);
});

test("/shellock sends continuation through Pi's normal user-message path", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-ext-"));
  await writeFile(join(root, "MISSION.md"), "# Mission\n\nAssess an authorized lab target.\n", "utf8");

  const harness = createExtensionHarness();
  shellockExtension(harness.pi);

  await harness.commands.get("shellock").handler("check exposed admin paths", createCommandContext(root, harness));

  assert.equal(harness.sentMessages.length, 1);
  assert.match(harness.sentMessages[0].content, /Continue Shellock mission work/);
  assert.match(harness.sentMessages[0].content, /check exposed admin paths/);
  assert.match(harness.sentMessages[0].content, /MISSION\.md, STATE\.md, SURFACE\.md, COVERAGE\.md, and THREAT_MODEL\.md/);
  await assert.doesNotReject(access(join(root, "evidence", "runs")));
});

test("/shellock queues a follow-up through Pi when the agent is busy", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-ext-"));
  await writeFile(join(root, "MISSION.md"), "# Mission\n\nAssess an authorized lab target.\n", "utf8");

  const harness = createExtensionHarness();
  shellockExtension(harness.pi);

  await harness.commands.get("shellock").handler("", createCommandContext(root, harness, { idle: false }));

  assert.equal(harness.sentMessages.length, 1);
  assert.equal(harness.sentMessages[0].options?.deliverAs, "followUp");
  assert.match(harness.notifications.at(-1).message, /queued/);
});

test("shellock exposes terminal chrome through Pi hooks without duplicate theme resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-ext-"));
  const harness = createExtensionHarness();
  shellockExtension(harness.pi);

  const resources = await harness.handlers.get("resources_discover")[0]({ type: "resources_discover", cwd: root, reason: "startup" }, createCommandContext(root, harness));
  assert.deepEqual(resources.themePaths, undefined);

  await harness.handlers.get("session_start")[0]({ type: "session_start", reason: "startup" }, createCommandContext(root, harness, { mode: "tui" }));

  assert.match(harness.statuses.get("shellock"), /shellock:pack local bash/);
  assert.match(harness.titles.at(-1), /Shellock - .* - pack/);
  assert.equal(harness.hiddenThinkingLabels.at(-1), "operator notes");
  assert.equal(harness.workingMessages.at(-1), "Shellock is thinking");
  assert.equal(harness.headers.length, 1);
});

function createExtensionHarness() {
  const commands = new Map();
  const handlers = new Map();
  const notifications = [];
  const sentMessages = [];
  const statuses = new Map();
  const titles = [];
  const hiddenThinkingLabels = [];
  const workingMessages = [];
  const headers = [];
  const pi = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
    sendUserMessage(content, options) {
      sentMessages.push({ content, options });
    },
  };

  return { commands, handlers, notifications, sentMessages, statuses, titles, hiddenThinkingLabels, workingMessages, headers, pi };
}

function createCommandContext(cwd, harness, options = {}) {
  return {
    cwd,
    mode: options.mode ?? "print",
    hasUI: options.mode === "tui",
    isIdle: () => options.idle ?? true,
    ui: {
      notify(message, type = "info") {
        harness.notifications.push({ message, type });
      },
      setStatus(key, text) {
        harness.statuses.set(key, text);
      },
      setTitle(title) {
        harness.titles.push(title);
      },
      setHiddenThinkingLabel(label) {
        harness.hiddenThinkingLabels.push(label);
      },
      setWorkingMessage(message) {
        harness.workingMessages.push(message);
      },
      setHeader(factory) {
        harness.headers.push(factory);
      },
      theme: {
        fg(_kind, value) {
          return value;
        },
      },
    },
  };
}
