## Project

P2P voice chat CLI for coworkers — like an office intercom.

Bun + TypeScript monorepo (`apps/cli`, `apps/server`, `packages/*`).

## Stack

- **Runtime:** Bun
- **Monorepo:** Bun workspaces + Turbo
- **CLI:** Stricli (type-safe commands, DI via `this: AppContext`)
- **Server:** Elysia
- **TUI:** OpenTUI
- **Linter/Formatter:** Biome (auto-formats on save)
- **Commits:** Conventional Commits (commitlint)

## Code style

- No comments that restate what types and naming already say — only comment the non-obvious
- Imports use `#*` subpath mapping (e.g. `import { foo } from '#services/foo'`)
- Single source of truth — never duplicate keys, enum values, or type info that belongs to a class/module; derive from the source instead
- Biome enforces `useMaxParams: 1` — use `biome-ignore` only for Stricli `func` signatures (framework-mandated)

## Validation

After finishing an implementation, always run:

1. `bun fix:codestyle` — auto-fix formatting/lint issues
2. `bun check:all` — verify types and codestyle pass
3. `bun run build` — verify the build succeeds

Check `package.json` scripts (root and per-app) for other available commands.

## Tone

Be terse and technical. Don't shy away from complexity — assume a deeply technical reader. Skip formalities, filler, and flowery language. Lead with the answer, not the reasoning.

Do what has been asked; nothing more, nothing less. Don't over-engineer, don't add features that weren't requested, don't refactor code that isn't part of the task.

## Keeping this file up to date

When a change affects code style, tooling, conventions, or project taste (new lint rules, formatter config, naming patterns, dependency choices, etc.), propose updating this file to reflect it.
