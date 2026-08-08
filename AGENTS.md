<!-- ZCP:BEGIN -->
# Zerops

Developer machine bound to a Zerops project. `zerops_*` MCP = primary surface for state/lifecycle/deploy/env/logs/verify. Local Bash/git/npm normal for working-dir setup.

Working dir = source of truth. Deploy: `zerops_deploy targetService="<hostname>"` (pushes working dir, blocks until build; needs `zerops.yaml` at repo root).

**Env:** this Mac shell does NOT carry the project's injected env — managed values resolve only inside Zerops containers. For a local `.env` use `zerops_env action="generate-dotenv"` (resolves server-side, writes the file); reach services over `zcli vpn up`. Never fetch a credential value to paste into a command.

## Zerops onboarding

When the user asks to be onboarded to Zerops — the exact phrase "onboard me to Zerops"
(any capitalization/punctuation), or a clear meta-onboarding request ("get me started
with Zerops", "I'm new here — what now?") — run the onboarding conversation before the
routing below. A request to get started with a SPECIFIC technology or task ("help me
get started with PostgreSQL", "deploy this repo") is normal routing, not onboarding.

1. Fetch `zerops_knowledge uri="zerops://playbooks/onboarding"` once and follow it.
2. Greet and offer its fork immediately — the opening needs no other tool call. Read-only
   state checks come after the person answers (or when they ask what's here); don't
   provision, import, or mutate anything until they pick a direction.
3. Once the user chooses to build or bring an app, normal routing (and the guided skill,
   when present) owns the work — onboarding only opens the conversation.
4. If Zerops tools are unavailable or auth fails, say so plainly and surface the reported
   recovery — never simulate onboarding.

Zerops has its own syntax. Don't guess — look up via `zerops_knowledge`, inspect live state via `zerops_*`. Runtime code runs in Zerops containers, not here.

## Route every user turn

| Intent | First action | Don't |
|---|---|---|
| Build/edit/scaffold/fix/deploy/debug a service | `zerops_discover`/`zerops_workflow action="status"` first if target/session unclear, then `zerops_workflow action="start" workflow="develop" intent="..." scope=["<host>"]` | Write code, run Bash/npx/SSH, or scaffold to scratch dirs before workflow start |
| No service yet, or infra/topology change — INCLUDING "deploy / set up / scaffold from existing recipe X" (user names a recipe slug like `zerops-laravel-minimal`) | `zerops_workflow action="start" workflow="bootstrap" intent="..."` — the route-menu surfaces the matching recipe; pick `route="recipe"` with the named slug | Write app code in bootstrap |
| Read or set platform state — logs/env/status/scale/subdomain/manage/events/verify | matching `zerops_*` tool | Guess values when live state exists |
| Promote dev/stage to a separate prod project ("go live", "deploy to prod", "nasaď na prod") | `zerops_workflow action="start" workflow="launch-production" intent="..." targetService="<host>"` | `zcli project create` or hand-rolled import.yaml |
| Pure concept Q unrelated to this project | prose, no tool | Re-route when user pivots to build/change |

## Discovery floor

Before service-scoped work: `zerops_workflow action="status"` if a session may exist (post-compact), else `zerops_discover`. User didn't name service + multiple plausible targets → ask once. Never invent hostnames, env keys, service types, subdomain URLs.

## Connection vars & secrets

Reference by name, never paste the value. `zerops_env`/`zerops_discover` read env KEYS and set STATE; a value you need in a command is `$VAR` — the shell expands it at exec time, so the value never enters your context. Pulling a credential value to paste into a command, file, or commit is the leak.

## Smells — catch & re-route

- Multi-section prose analysis (framework cmp, IA, "let me first analyze") for service-shaped task → workflow start IS the analysis surface (returns plan + atoms scoped to your `intent`). Pick a sensible default, start, react to the response. User saying "analyze first" / "make a plan" doesn't bypass.
- Writing code or `zerops.yaml` before workflow/status/discover selected service.
- Files in `/tmp` or random scratch dirs for app code.
- Asking whether to deploy to Zerops when ZCP is already bound to this project.
- Bash/SSH for platform ops covered by `zerops_*` (env, logs, scale, restart, etc.).
- Diagnosing live errors/502s/build failures from prose instead of `zerops_verify`/`zerops_logs`/`zerops_events`/`zerops_env`.
- Hand-rolling `import.yaml` or `zcli project create` for a "promote to prod" / "go live" intent → `workflow="launch-production"`.

## Workflow detail

- `develop` — service code edit. `scope` = runtime services this touches; get from `zerops_discover`, don't invent. `intent` = one-line proposal; workflow returns the plan, react to that. 1 task = 1 session; new `intent` auto-closes prior.
- `bootstrap` — provision services / change infra. Closes → continue in develop. Mid-develop infra side-trip: start bootstrap; develop session persists.
- `launch-production` — promote dev/stage to a SEPARATE prod project. Stateless multi-call: `scope-prompt` → `classify-prompt` → `ready-to-launch` → `launching` → `configuring-pipeline` → `launched`. Each call passes the accumulated `inputs` block forward (no `action="complete"` — that's bootstrap-only). At `ready-to-launch`, `delegatedLaunch.available` says whether ZCP can mint the launch-window token itself from a one-time platform delegation on `confirmLaunch=true` (no value crosses the conversation); otherwise the user supplies one manually (Custom access per project + Allow creating projects toggle ON) as `launchKey`. ZCP never persists it either way. `targetService` accepts either half of a standard pair.

## Recovery

Phase unclear (post-compact, mid-task): `zerops_workflow action="status"`. Returns envelope, plan, next action.

## Tool errors

Shape: `{code, error, suggestion?, apiCode?, diagnostic?, apiMeta?, checks?, recovery?}`. `code`+`error` always present. `recovery` set → call before retry/ask. Absent → fall back to `zerops_workflow action="status"`. `checks` = multi-check failures (`kind` + optional `preAttestCmd`/`expectedExit`).
<!-- ZCP:END -->

# Repository Guidelines

## Project Overview

Pixel Ape Web is a Vite, React, and TypeScript pixel-art application. The app entry points are `src/main.tsx` and `src/App.tsx`. Domain types and project logic live in `src/types.ts` and `src/project.ts`, shared icons are in `src/icons.tsx`, and global styling is in `src/styles.css`. Static assets belong in `public/` when needed. Keep generated planning and handoff documents in `Plans/` and `Reports/`.

## Build and Development Commands

- `npm install` installs the locked dependencies.
- `npm run dev` starts the Vite development server.
- `npm run typecheck` runs the TypeScript project checks.
- `npm run build` type-checks and creates the production bundle.
- `npm run preview` serves the production build locally.

Run `npm run typecheck` and `npm run build` before handing off code changes. Do not start a development server unless it is needed for verification or the user asks for it.

## Coding Conventions

Use TypeScript and follow the formatting and naming patterns in the surrounding files. Prefer small, focused React components, explicit types at reusable boundaries, and straightforward state flow. Keep pixel-art domain behavior separate from presentation when there is a clear reusable or testable boundary. Avoid adding dependencies for behavior that can be implemented cleanly with the existing stack.

## Environment Variable Safety

Never read, inspect, print, log, echo, expose, or include the values of environment variables or `.env` files in tool output, responses, reports, commits, or generated artifacts. Do not run commands that enumerate the environment or display secret values.

If the user asks to use an environment variable, reference it dynamically by its variable name inside the relevant command or script without first reading or printing its value. Ensure scripts consume the variable at runtime, avoid debug or trace modes that could reveal it, and never replace it with a literal secret. It is acceptable to inspect or update `.env.example` only when it contains documented placeholders rather than real credentials.

## Change Hygiene

Preserve unrelated user changes and do not commit generated output such as `dist/`, `node_modules/`, plans, reports, or local environment files. Use short imperative commit subjects when asked to commit. Summarize behavior changes and list the verification commands run at handoff.

## Git and Github

1. When creating PRs, give a TLDR summary, then briefly mention the changes, highlight breaking changes if any, also mention if the changes are reversible and how, or how to revert them. 
2. Add labels to PRs based on the type of changes. eg: "bug fix", "feature", "refactor", "documentation", "style", "test", "chore", "performance", "ci", "build", "experimental", "breaking-change", "reversible"
3. create branches off main with this convention 'ac/{{type}}/name-of-task' where 'ac' is my initials and type of changes is one of the labels mentioned above for example: feat, fix, chore etc.