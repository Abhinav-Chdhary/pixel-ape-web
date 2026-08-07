# Notes: Medium TODO Planning

## Scope

- Add color selection above the foreground/background section.
- Allow editable hex input in the color-selection dialog.
- Ensure selecting an empty palette slot is accurately reflected in the selected-color/foreground UI.

## Findings

- `App.tsx` owns the current paint color (`color: string`), the selected palette index (`editingPaletteSlot: number | null`), and the last eyedropper sample.
- `PalettePanel.tsx` renders the swatches, the current-color preview, foreground/background controls, and the anchored RGB/HSV/HSL/gray dialog.
- The existing dialog already uses `Color` helpers from `colorModels.ts` and updates the target continuously; no new dialog is needed.
- Palette entries are `string | null`, but the foreground paint color cannot be `null`. Clicking an empty swatch changes only `editingPaletteSlot`; the prior string color therefore remains in the preview and foreground chip.
- A selected palette slot currently also gets updated while editing the canvas background. The implementation should separate the foreground's palette target from the background target.
- The dialog displays `toHex(draftColor)` but has no editable hex field. `parseColor` accepts six-digit hex and `rgba`, so a small validated hex-specific helper is sufficient.
- Existing automated coverage is pure-function-only: `colorModels.test.ts` and `paletteResize.test.ts`, run successfully with `bun test` (20 passing). `npm run typecheck` also passes.
