import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import shellockExtension from "../dist/pi/extensions/shellock.js";

test("shellock exposes terminal chrome through Pi hooks without duplicate theme resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "shellock-ext-"));
  const harness = createExtensionHarness();
  shellockExtension(harness.pi);

  const resources = await harness.handlers.get("resources_discover")[0]({ type: "resources_discover", cwd: root, reason: "startup" }, createCommandContext(root, harness));
  assert.deepEqual(resources.themePaths, undefined);
  assert.match(resources.skillPaths[0], /resources\/skills$/);
  assert.equal(resources.promptPaths, undefined);
  assert.deepEqual([...harness.commands.keys()].sort(), ["shellock-doctor", "shellock-runtime"]);

  await harness.handlers.get("session_start")[0]({ type: "session_start", reason: "startup" }, createCommandContext(root, harness, { mode: "tui" }));

  assert.equal(harness.statuses.size, 0);
  assert.match(harness.titles.at(-1), / - shellock$/);
  assert.equal(harness.hiddenThinkingLabels.at(-1), "reasoning");
  assert.equal(harness.workingMessages.at(-1), "reasoning");
  assert.equal(harness.workingVisibles.at(-1), true);
  assert.deepEqual(harness.workingIndicators.at(-1), { frames: ["·", "•", "●", "•"], intervalMs: 160 });
  assert.equal(harness.headers.length, 1);
  assert.equal(harness.footers.length, 1);
  assert.equal(harness.editorComponents.length, 1);
  assert.equal(harness.notifications.length, 0);

  const header = harness.headers[0](undefined, createTheme()).render(120);
  const headerText = header.join("\n");
  assert.equal(header.length, 4);
  assert.ok(header[0].trimStart().startsWith("╭"));
  assert.ok(header[0].endsWith("╮"));
  assert.ok(header.at(-1).trimStart().startsWith("╰"));
  assert.ok(header.at(-1).endsWith("╯"));
  assert.ok(header.some((line) => line.trimStart().startsWith("│") && line.endsWith("│")));
  assert.match(header[0], /shellock/);
  assert.match(headerText, /workspace/);
  assert.match(headerText, /test-provider\/test-model/);
  assert.doesNotMatch(headerText, /security research harness|local bash|___/);
  assert.doesNotMatch(headerText, /case|mission|shellock-init|Tool Contract|Mission Control/iu);
  assert.ok(header.every((line) => visibleWidth(line) <= 120));

  const footer = harness.footers[0](
    { requestRender() {} },
    createTheme(),
    {
      getGitBranch: () => "main",
      onBranchChange: () => () => {},
    },
  );
  const footerLines = footer.render(120);
  const footerText = footerLines.join("\n");
  assert.equal(footerLines.length, 1);
  assert.match(footerText, /main/);
  assert.match(footerText, / · /);
  assert.match(footerText, /local bash/);
  assert.match(footerText, /test-provider\/test-model/);
  assert.doesNotMatch(footerText, /case|mission/iu);
  assert.match(footerText, /12k \/ 1\.0M/);

  const editor = harness.editorComponents[0]({ terminal: { rows: 40 }, requestRender() {} }, createEditorTheme(), {});
  const editorLines = editor.render(80);
  assert.ok(editorLines[0].startsWith("╭"));
  assert.ok(editorLines[0].endsWith("╮"));
  assert.ok(editorLines.at(-1).startsWith("╰"));
  assert.ok(editorLines.at(-1).endsWith("╯"));
  assert.ok(editorLines[1].startsWith("│ › "));
  assert.doesNotMatch(editorLines.at(-1), /test-model/);
  assert.ok(editorLines.slice(1, -1).every((line) => line.startsWith("│ ") && line.endsWith(" │")));
  assert.ok(editorLines.every((line) => visibleWidth(line) === 80));

  editor.setText(Array.from({ length: 16 }, (_, index) => `line ${index + 1}`).join("\n"));
  const scrolledEditorLines = editor.render(80);
  assert.match(scrolledEditorLines[0], /↑ 4 more/);

  const compactHeader = harness.headers[0](undefined, createTheme()).render(68);
  assert.ok(compactHeader.every((line) => visibleWidth(line) <= 68));

  const wideHeader = harness.headers[0](undefined, createTheme()).render(220);
  assert.ok(wideHeader.every((line) => visibleWidth(line) <= 220));
  assert.ok(wideHeader.every((line) => visibleWidth(line.trimStart()) <= 72));
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
  const footers = [];
  const editorComponents = [];
  const workingIndicators = [];
  const workingVisibles = [];
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

  return {
    commands,
    handlers,
    notifications,
    sentMessages,
    statuses,
    titles,
    hiddenThinkingLabels,
    workingMessages,
    headers,
    footers,
    editorComponents,
    workingIndicators,
    workingVisibles,
    pi,
  };
}

function createCommandContext(cwd, harness, options = {}) {
  return {
    cwd,
    mode: options.mode ?? "print",
    hasUI: options.mode === "tui",
    model: {
      provider: "test-provider",
      id: "test-model",
    },
    isIdle: () => options.idle ?? true,
    getContextUsage: () => ({
      tokens: 12_000,
      contextWindow: 1_000_000,
      percent: 1.2,
    }),
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
      setWorkingVisible(visible) {
        harness.workingVisibles.push(visible);
      },
      setWorkingIndicator(indicator) {
        harness.workingIndicators.push(indicator);
      },
      setHeader(factory) {
        harness.headers.push(factory);
      },
      setFooter(factory) {
        harness.footers.push(factory);
      },
      setEditorComponent(factory) {
        harness.editorComponents.push(factory);
      },
      theme: createTheme(),
    },
  };
}

function createTheme() {
  return {
    fg(_kind, value) {
      return value;
    },
    bold(value) {
      return value;
    },
  };
}

function createEditorTheme() {
  return {
    borderColor(value) {
      return value;
    },
    selectList: {
      selectedPrefix: () => "",
      selectedText: (value) => value,
      description: (value) => value,
      scrollInfo: (value) => value,
      noMatch: (value) => value,
    },
  };
}
