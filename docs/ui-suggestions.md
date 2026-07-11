# Shellock Terminal UI Suggestions

Terminal UI review for Shellock's chrome (`src/pi/extensions/shellock.ts`, `resources/themes/shellock-*.json`). All changes are surface/visual only — no product features, no agent-loop changes.

Scope: the startup panel (`ShellockHeader`), composer (`ShellockEditor`), footer (`ShellockFooter`), both themes, and responsive behavior. Verified against actual rendered output at widths 24–220.

---

## What looks visually weak or unnecessary

### 1. The ASCII wordmark is the weakest element and consumes the most space
`SHELLOCK_WORDMARK` (`shellock.ts:17–22`) is 4 lines of stylized slashes/underscores rendered in `muted` (shellock-dark `#92999e`). It only appears in the two-column layout (width ≥ ~90), where it occupies the entire left half of the card. The left half reads as abstract decorative texture, not "shellock," while the right half carries all the actual information. The wordmark doubles the card's height for no informational gain.

### 2. Identity is stated three times
The top border title says `shellock` (`shellock.ts:157–158`), the wordmark sort-of says "shellock," and the first content row says `security research harness`. For a minimal bar, one of these should carry the identity.

### 3. `setStatus("shellock", …)` is dead in TUI mode
`shellock.ts:63` sets `shellock · local bash` into the extension-status slot, but the custom footer (`shellock.ts:81`) replaces Pi's built-in footer and `ShellockFooter.render` never reads `getExtensionStatuses()` — so that text is never rendered. Wasted call and a latent duplication risk.

### 4. Runtime status appears twice on screen
`local bash` shows in the header (`runtime    local bash`, `shellock.ts:136/151`) **and** on the footer right (`local bash · …`, `shellock.ts:209`). Both are visible at startup. branding.md says runtime belongs in the footer; the header copy is redundant.

### 5. The `●` readiness dot is decorative, not informational
It's hard-coded `success` green (`shellock.ts:132/148`) regardless of state — same dot for "no model," "local bash," or "Incus VM." It borrows the success color to mean "present," which is a semantic mismatch and gives no live-state signal.

---

## Hierarchy, spacing, alignment, density, readability

### Density
The header is 6 lines (top border + 4 content + bottom border). In an 80×24 terminal that's ~25% of the screen for orientation chrome, which contradicts branding.md's "transcript as the dominant surface." Grok Build / Factory Droid equivalents sit around 2–3 lines. With the composer (3 lines min) + footer (1 line), total chrome reaches ~10/24 rows.

### Border language is inconsistent
The header uses double-line box drawing (`╔═╗ ║ ╚╝`, `shellock.ts:156–174`) while the composer uses rounded single-line (`╭─╮ │ ╰╯`, `shellock.ts:198–214`). Two different border idioms on screen at once reads as two different apps. A sleek product picks one border language.

### Truncation has no ellipsis
`keyValueLine` and the footer pass `""` as the ellipsis to `truncateToWidth` (via `fitText`). Paths chop mid-token in renders: `/var/folders/bn/ww74kkqs28x1nc8nt_mrpcr800` and `…/ww74kkqs2`. A path that simply stops looks like a complete path — users can't tell data was cut. Biggest readability bug.

### Two-column gutter is mostly air
At width 100: left column 38 wide (wordmark ~33, ~5 trailing), a fixed 4-space gap (`shellock.ts:171`), then a right column of 54 where content is ~30 chars — ~24 trailing spaces per right-column line plus ~8 spaces of gutter. Layout is ~60% whitespace, with a ragged right edge inside a boxed card.

### Footer hierarchy
Branch and cwd are both `dim` and separated by two spaces (`main  ~/path`, `shellock.ts:206`). With no glyph and no color difference, `main` reads as the start of the path. The right side uses `·` as a separator, so the same line uses two different separator conventions (two-space on the left, middot on the right).

### Footer is missing the model
branding.md says "Keep model, context, branch, and runtime in a quiet two-line footer," but `ShellockFooter.render` (`shellock.ts:202–219`) shows branch, cwd, runtime, context — no model. The model lives only in the header and the composer's bottom border. The persistent surface (footer) lacks the one piece of live identity users glance at most.

### No live-state gradient
All thinking-level borders collapse to `borderAccent` in both themes (`shellock-dark.json:73–74`, `shellock-light.json:73–74` — `thinkingOff`…`thinkingXhigh` all identical). Pi's schema intends these as a "visual hierarchy from subtle to prominent." Flattening them removes the one subtle live-state cue the composer border could give — exactly the "clear live-state controls" branding.md wants from Factory Droid.

---

## What should be removed, simplified, or repositioned

- **Drop the two-column wordmark layout entirely.** The single-column box (`shellock.ts:129`) already shows the same four key/value rows in less width and is cleaner. Removing `renderTwoColumn`/`leftPanel` (`shellock.ts:104–119, 142–144`) cuts the card from 6 → 4 (or 3) lines and eliminates the worst whitespace.
- **Retire the 4-line `SHELLOCK_WORDMARK`.** If a wordmark is wanted, reduce it to a single inline line (e.g., the title already in the top border). The borderless compact mode (`shellock.ts:121–126`) is the cleanest version of the header — it suggests the boxed card is over-engineered.
- **Remove the dead `setStatus` call** (`shellock.ts:63`) unless the footer is made to surface extension statuses.
- **Show runtime once.** Keep it in the footer (per branding.md) and drop the `runtime` row from the header, or vice-versa — not both.
- **Pick one border language.** Round the header to match the composer (`╭╮│╰╯`), or square the composer to match the header. Given the composer is the stronger design, rounding the header (or going borderless) is the lower-effort unification.
- **Move the model to the footer** (per the doc) **or** document that it lives in the composer border — but make the format consistent (header shows `provider/name`, composer shows `name` only — pick one).

---

## Specific improvements

### Startup panel (`ShellockHeader`)
1. Collapse to **3–4 lines**: one title row (`shellock v0.1.0`) + two info rows (workspace, model) + border. Put `runtime` only in the footer.
2. **Unify the border** with the composer — use rounded single-line, or go borderless like the compact mode and let spacing carry the grouping.
3. **Fix path truncation** — use a leading-ellipsis form for long paths (`…/bn/ww74kkqs/shellock-ext`) or truncate path *segments* (`~/…/shellock-ext`) instead of chopping the tail. Always pass a visible ellipsis to `truncateToWidth`.
4. In the compact (<52) mode, **keep the model visible** — currently it drops `workspace` and `model`, leaving only `shellock v0.1.0` + tagline; the model then exists only in the composer border.
5. Replace the static green `●` with the accent color (see Colors) so the dot is brand identity, not a borrowed "success" state.

### Composer (`ShellockEditor`)
The composer is the strongest part — keep its core. Small fixes only:
1. **Restore scroll indicators.** `render` strips both the top scroll indicator (via `shift()`) and the bottom one (via the `/^─+…$/` regex, `shellock.ts:228–231`) and draws plain `╭──╮`/`╰──╯`. For multi-line pasted input the user gets no signal that content is above/below. Surface `↑ N more` / `↓ N more` into the rounded borders.
2. **Optional top-border hint.** A subtle label in the top border (or a one-time placeholder when empty) would give a first-run affordance without adding a persistent line — only if it can stay dim enough to not break minimalism.
3. **Match model format with the header** (`provider/name` vs `name`) so the same model reads the same way everywhere.

### Footer (`ShellockFooter`)
1. **Add the model** on the right, per branding.md: `main  ~/path · model local bash · 12k/1.0M`, or stack as the doc's "two-line footer" when narrow.
2. **Separate branch from path** with the same `·` used elsewhere, or give the branch its own color (`accent`/`muted`) so it doesn't merge into the path.
3. **Use a visible ellipsis** on path truncation (same fix as header).
4. At <56 the two-line split is fine, but **drop runtime from line 2** if it's also in the header — currently narrow mode duplicates it too.

### Colors (themes)
1. **Give Shellock a real accent.** In both themes `accent` and `text` are identical (`#d8dde0` dark, `#202427` light — `shellock-dark.json:4,12`, `shellock-light.json:4,12`). The whole chrome is effectively grayscale with one borrowed green dot. Pick one of the unused palette hues (`blue #7fa7c9`, `cyan #78aeb1`, or `violet #a99ac0`) as `accent` so the title, dot, and spinner brightest frame carry a brand identity. Biggest lever for feeling "distinct" without copying Grok/Factory.
2. **Rebuild the thinking-level gradient** (`thinkingOff` → `thinkingXhigh`) as a real ramp (e.g., `borderMuted` → `border` → `borderAccent` → `accent`) so the composer border reflects reasoning intensity — the live-state cue currently missing.
3. **Differentiate `border` and `borderMuted`** — they're ~2–8 RGB units apart and effectively identical. If the header should be subtler than the composer, make that gap intentional (e.g., header `borderMuted`, composer `borderAccent`) rather than two near-equal greys.
4. **Stop using `success` for the static dot** — once accent exists, the dot should be `accent`; reserve `success`/`error`/`warning` for actual state changes.

### Responsive behavior
The thresholds are mostly sound; a few tightenings:
1. **The two-column threshold (86) is now moot** if the wordmark is dropped — the single-column box can serve all widths ≥52, with compact (<52) as-is. Removes a layout branch and a width-dependent visual jump.
2. **Header centering at wide terminals** (`shellock.ts:100`) is fine, but cap the card narrower than 104 once the wordmark is gone — a 104-wide box of four short rows looks stretched; ~64–72 reads as a tighter card.
3. **Composer already handles down to 24** well — keep it.
4. **Footer split at <56** works, but make the break land on a logical boundary (branch+path on line 1, runtime+context on line 2) rather than the current `alignColumns` overflow split, which can orphan the runtime onto its own line awkwardly at 48.

---

## Quick wins, in priority order
1. Give `accent` a real brand color (themes) — biggest "distinct vs generic terminal" win.
2. Drop the two-column wordmark layout and the 4-line wordmark → header shrinks to ~3–4 lines.
3. Add visible ellipsis to all path truncation (header + footer).
4. Unify header border with the composer's rounded border.
5. Remove the dead `setStatus` call and the duplicated runtime (header vs footer).
6. Restore the thinking-level border gradient.