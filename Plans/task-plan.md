# Task Plan: Medium TODOs

## Goal
Implement and verify the three unchecked medium-priority color-palette improvements in `TODO.md`, using the supplied HSV color-selector reference.

## Phases
- [x] Phase 1: Initialize planning artifacts and identify the scoped TODOs.
- [x] Phase 2: Inspect the palette and color-picker architecture.
- [x] Phase 3: Define behavior, sequencing, implementation steps, and verification.
- [x] Phase 4: Write and deliver the final plan.
- [x] Phase 5: Implement the nullable foreground state, picker, and hex inputs.
- [ ] Phase 6: Complete browser-level visual verification.

## Key Questions
1. Where do foreground/background selections and empty palette slots live in application state?
2. Is a color dialog already present, and can it be extended rather than replaced?
3. What existing tests can anchor the plan, and where are the behavior gaps?

## Decisions Made
- Scope only the three unchecked items under the `Medium` heading in `TODO.md`.
- Treat the requested output as a written implementation plan; do not modify application behavior.
- Use an explicit nullable foreground selection rather than retaining the previous color when an empty palette slot is selected.
- Use the browser-native color input as the quick selector and retain the existing anchored dialog for detailed channel/hex editing.
- Replace the native-input proposal with an inline HSV saturation/value plane, hue rail, and editable hex input, matching the supplied reference.

## Errors Encountered
- None.

## Status
**Currently in Phase 6** — implementation and automated checks are complete; browser permission prevented the final visual pass.
