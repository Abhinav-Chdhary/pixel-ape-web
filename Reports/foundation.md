# Pixel Ape Web Foundation

## Reused from Pixel Ape

- React editor UI: canvas workspace, palette, tools, sprite tabs, and layout.
- Pixel-domain logic: canvas creation/resizing, bucket fill, line drawing, curve drawing, erasing, palette helpers, and types.
- Editor styling and icons.

## Intentionally not copied

- The local CLI and npm packaging files.
- Filesystem synchronization and its Vite development-server API.
- Local spatial sprite-file workflow.

## Temporary storage boundary

`src/hooks/useLocalWorkspace.ts` keeps the extracted UI functional with browser storage. Replace it with API requests after the backend and database are created; the editor can retain its existing component interfaces.
