# Task Plan: Pixel Ape Web Foundation

## Goal
Create a clean, independent frontend repository that reuses the existing Pixel Ape editor while remaining ready for a Zerops API and database.

## Phases
- [x] Phase 1: Create a separate local Git repository
- [x] Phase 2: Copy reusable editor UI, styling, and pixel-domain helpers
- [x] Phase 3: Replace local file synchronization with temporary browser storage and verify the frontend build
- [ ] Phase 4: Add backend, PostgreSQL, and Zerops deployment during the hackathon

## Decisions Made
- `pixel-ape` remains the local-first npm/CLI package.
- `pixel-ape-web` is the hackathon product and currently persists its starter workspace in browser storage only.
- The local-storage hook is explicitly a temporary seam for the forthcoming API.

## Status
**Ready for Phase 4** — the standalone frontend foundation is committed and pushed to GitHub. Build the API, database, and Zerops services during the hackathon.

## Errors Encountered
- Initial folder-move command used paths relative to the repository while already inside it. No files changed; rerun with repository-relative paths.
- The shared npm cache has root-owned entries, so npm could not write to it. Use a repository-specific cache under `/tmp` for dependency installation and verification.
- The first build exposed missing Vite type declarations and temporary-hook callbacks with overly narrow signatures. Add the Vite declaration and mirror the existing editor callback signatures.
- A fixed literal status was narrowed by TypeScript in the existing status-message branch. Expose it through typed hook state so the UI retains the full status union expected by the future API-backed hook.
- Cleanup command was rejected because recursive deletion is prohibited in this environment. Move the accidental npm-cache artifacts to a temporary recovery directory instead.
