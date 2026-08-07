# Medium TODO Implementation Plan

## Scope

This plan covers only the unchecked `Medium` entries in `TODO.md`:

1. Add a color selector above the Foreground/Background controls.
2. Make hex values editable in the color dialog.
3. Make an active empty palette slot display as empty rather than as the previous foreground color.

## Recommended UX Contract

- The palette has one explicit active foreground selection: either a palette slot containing a color, a custom sampled color, or an empty palette slot.
- Selecting an empty slot displays a checkerboard/`EMPTY` state in both the current-color preview and Foreground control. It does not silently retain the previous color.
- An inline HSV-style color selector—saturation/value plane, hue rail, and hex input—sits immediately above the Foreground and Background controls. It changes the active foreground color and, when a palette slot is active, writes that color into that slot.
- The existing anchored dialog remains the detailed editor. It gains a validated hex field; the alpha value continues to be controlled separately by the existing `A` channel.
- Choosing a visible color for an empty slot makes that slot opaque by default. While no color is chosen, drawing and filling are no-ops so the UI never claims an empty foreground while painting with a stale color.

## Implementation Sequence

### 1. Make foreground selection nullable and explicit

Files: `src/App.tsx`, `src/components/04_organisms/PalettePanel.tsx`

- Replace the ambiguous `color`/`editingPaletteSlot` pairing with `foregroundColor: string | null` and `selectedPaletteSlot: number | null` (names may vary, but responsibilities should remain separate).
- Start with the first default palette slot selected so the default foreground remains well-defined.
- On a populated swatch click, set both the selected slot and its color. On an empty swatch click, set the selected slot and set the foreground to `null` unless an eyedropper sample is being saved into it.
- On an eyedropper pick, set the foreground to the sampled color and clear the selected palette slot; this prevents a different swatch from appearing selected after a custom sample.
- Centralize writes in two operations:
  - `setForegroundColor(next)`: updates the foreground and updates `workspace.palette[selectedPaletteSlot]` only when a slot is selected.
  - `setBackgroundColor(next)`: changes only the sprite background.
- Use the foreground operation for slider edits, number edits, the new color input, hex edits, and saving an eyedropper sample. This also removes the current accidental behavior where changing the background can overwrite a selected palette slot.
- Guard pencil, fill, line preview/commit, and stroke helpers when `foregroundColor` is `null`; eraser and eyedropper keep working.

### 2. Render the empty selection state correctly

Files: `src/components/04_organisms/PalettePanel.tsx`, `src/components/04_organisms/PalettePanel.module.css`

- Update props and selected-swatch logic to use `foregroundColor: string | null` and `selectedPaletteSlot`.
- Render the existing checkerboard treatment and an `EMPTY` label in `.currentColor` when no foreground exists; avoid `toUpperCase()` and CSS `backgroundColor` calls on `null`.
- Render the Foreground chip with the same checkerboard rather than the former color when the selection is empty. Keep the active empty swatch visibly selected.
- Keep the dialog title slot-aware (`Slot N`), and open an empty slot with an opaque editable default so the first RGB, picker, or hex change produces a visible palette color.
- Add a small status/hint near the controls such as “Choose a color to paint” while the foreground is empty, so the no-op canvas behavior is discoverable.

### 3. Add the quick color selector above Foreground/Background

Files: `src/components/04_organisms/PalettePanel.tsx`, `src/components/04_organisms/PalettePanel.module.css`

- Insert a labelled **Color** control between the palette tip and `.colorDock`; it should appear directly before the Foreground and Background buttons in visual and keyboard order.
- Use an accessible native `<input type="color">`, with an adjacent preview/hex readout if space permits. Its value uses a safe opaque fallback while the active selection is empty.
- On input, convert the selected `#RRGGBB` value to the application color format and route it through `setForegroundColor`. Preserve the active slot relationship so changing the selector fills/updates that slot.
- Ensure the label describes the effect (“Choose foreground color”) and the control remains usable at the narrow layout breakpoint.

### 4. Add editable hex support to the existing dialog

Files: `src/components/04_organisms/colorModels.ts`, `src/components/04_organisms/PalettePanel.tsx`, `src/components/04_organisms/PalettePanel.module.css`

- Add a pure `parseHexColor` helper that accepts optional `#`, accepts standard three- and six-digit hex values case-insensitively, and returns `null` for incomplete/invalid input. Canonical serialization stays lower-case `#rrggbb` via `toHex`.
- Add a controlled text field beside or below the dialog's hex readout. Keep its raw draft separate from `draftColor`, so typing `#`, partial values, or an invalid value never resets the user's text or mutates the palette.
- When the draft first becomes valid, update RGB through the shared foreground/background write path. Retain the current alpha; newly opened empty-slot editors begin at 100% alpha.
- On blur or Enter, canonicalize valid input; retain invalid text with `aria-invalid` and a concise inline validation message. Escape/close should leave the last valid applied color intact.
- Synchronize the text field whenever sliders, numeric inputs, or color-model tabs change the valid draft color.

### 5. Verify the behavior

Files: `src/components/04_organisms/colorModels.test.ts`; optionally a new focused state helper test if selection transitions are extracted.

- Add unit tests for full and shorthand hex parsing, omitted `#`, invalid/incomplete values, and preservation of the supplied opacity.
- If foreground-selection transitions are extracted into a helper, test populated-slot selection, empty-slot selection, eyedropper selection, filling an empty slot, and the rule that a background edit does not alter the palette.
- Run `bun test`, `npm run typecheck`, and `npm run build`.
- Manually check the following matrix in the browser:
  - populated slot → quick selector, slider, and hex input all update the slot and Foreground;
  - empty slot → previews show empty, painting does not reuse the old color, then picker/hex creates an opaque swatch;
  - eyedropper sample → foreground changes with no stale palette selection, then saving into an empty slot works;
  - background dialog → canvas background changes without altering the selected swatch;
  - transparent background, responsive palette layout, keyboard focus, invalid hex, and alpha edits remain usable.

## Acceptance Criteria

- A color selection control is visibly and accessibly positioned above Foreground/Background.
- The dialog accepts editable valid hex values and safely rejects invalid partial input without corrupting color state.
- Selecting an empty palette slot shows an empty current-color and Foreground state, never the prior color.
- First editing an empty slot creates a visible color, and no canvas action reuses a stale foreground while that slot is empty.
- Palette changes persist through the existing local-workspace mechanism; background changes do not unintentionally modify palette entries.

## Dependencies and Risks

- No API, schema, or dependency change is needed; palette persistence already supports `null` entries.
- This intentionally defines the previously ambiguous empty-slot behavior as “no active paint color.” If empty selection should instead mean “transparent paint,” replace the canvas guard with an explicit transparent-paint mode before implementation.
- There is no React component-test harness today. Keep regression coverage in pure helpers and use the manual matrix unless the team wants to introduce a UI-testing dependency.
