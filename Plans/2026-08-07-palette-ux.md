# Goal

Complete the remaining palette usability work: put color selection above the foreground/background dock, support direct hex entry, and accurately reflect an empty selected slot in the foreground preview.

## Current status

Completed. The palette now includes an inline HSV selector above the foreground/background dock, editable hex inputs in both selector and dialog, and an explicit empty-slot foreground state. The selector was tightened after review: its hue rail is visibly rainbow, the duplicate current-color readout was removed, and the saturation/value plane is 20% shorter.

## Remaining steps

1. Perform a manual browser visual/interactions pass when localhost browser access is available.
2. Consider component-level interaction tests if a React test harness is added to the project.

## Open questions

- None. Empty selection is an unset/pending foreground state; opacity remains a separate channel.

## Relevant files

- `src/components/04_organisms/PalettePanel.tsx:29`
- `src/components/04_organisms/PalettePanel.module.css:8`
- `src/components/04_organisms/colorModels.ts:23`
- `src/components/04_organisms/colorModels.test.ts:40`
- `src/App.tsx:252`

## Decisions already made

- Palette data remains in the browser-local workspace manifest.
- Color editing is model-based; changes should continue to flow through the existing normalized color model rather than add a second source of truth.
- An empty palette slot has no active paint color, preventing stale-color painting until the slot is assigned a color.
- The custom hue rail, rather than a browser-native range appearance, guarantees a visible color spectrum.
