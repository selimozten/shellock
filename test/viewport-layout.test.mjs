import assert from "node:assert/strict";
import test from "node:test";
import { anchorViewportLines } from "../dist/pi/extensions/shellock.js";

const anchor = "\x1b]1337;shellock-viewport-anchor\x07";

test("viewport anchor pushes the composer and footer to the bottom", () => {
  const lines = ["header", "", anchor, "composer top", "composer", "composer bottom", "footer"];
  const rendered = anchorViewportLines(lines, 12);

  assert.equal(rendered.length, 12);
  assert.deepEqual(rendered.slice(-4), ["composer top", "composer", "composer bottom", "footer"]);
  assert.equal(rendered.includes(anchor), false);
});

test("viewport anchor collapses after transcript content fills the terminal", () => {
  const lines = ["header", ...Array.from({ length: 10 }, (_, index) => `message ${index}`), anchor, "composer", "footer"];
  const rendered = anchorViewportLines(lines, 8);

  assert.deepEqual(rendered, lines.filter((line) => line !== anchor));
});

test("viewport layout leaves unrelated component output unchanged", () => {
  const lines = ["header", "composer", "footer"];
  assert.equal(anchorViewportLines(lines, 12), lines);
});
