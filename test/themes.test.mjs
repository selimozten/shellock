import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

for (const variant of ["dark", "light"]) {
  test(`shellock ${variant} theme preserves visual hierarchy`, async () => {
    const theme = JSON.parse(
      await readFile(resolve(`resources/themes/shellock-${variant}.json`), "utf8"),
    );

    assert.notEqual(theme.vars.accent, theme.vars.text);
    assert.notEqual(theme.colors.borderMuted, theme.vars.border);

    const thinkingRamp = [
      theme.colors.thinkingOff,
      theme.colors.thinkingMinimal,
      theme.colors.thinkingLow,
      theme.colors.thinkingMedium,
      theme.colors.thinkingHigh,
      theme.colors.thinkingXhigh,
      theme.colors.thinkingMax,
    ];
    assert.equal(new Set(thinkingRamp).size, thinkingRamp.length);
    assert.equal(theme.colors.thinkingXhigh, "accent");
  });
}
