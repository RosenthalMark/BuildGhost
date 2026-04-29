# Contributing To BuildGhost

This repo is an active platform build, not a finished product. Contributions should favor clarity, modularity, and truthful documentation over hype or placeholder behavior.

## What Belongs Here

Use this file for repo-level contribution expectations:

- how to structure changes
- what to update when behavior changes
- where module-specific integration rules live
- how to avoid leaking private planning material

## Before You Open A PR

- keep changes scoped to a clear feature, fix, or documentation pass
- avoid mixing unrelated refactors into the same change
- update docs when user-visible behavior or module contracts change
- do not present planned behavior as implemented behavior

## Documentation Rules

- the root [`README.md`](/Users/markrosenthal/Desktop/REPOS/BuildGhost/README.md) should explain what BuildGhost is, what exists now, and how to get oriented
- module-specific behavior belongs in that module's own `README.md`
- terminal integration requirements belong in [`Docs/module-development-standard.md`](/Users/markrosenthal/Desktop/REPOS/BuildGhost/Docs/module-development-standard.md)
- release/versioning process belongs in [`Docs/release-policy.md`](/Users/markrosenthal/Desktop/REPOS/BuildGhost/Docs/release-policy.md)

## Behavior Changes

If your change affects shipped behavior:

- update [`CHANGELOG.md`](/Users/markrosenthal/Desktop/REPOS/BuildGhost/CHANGELOG.md)
- update the relevant module or repo documentation
- bump [`VERSION`](/Users/markrosenthal/Desktop/REPOS/BuildGhost/VERSION) only when the change is actually release-worthy under the release policy

See:

- [`Docs/release-policy.md`](/Users/markrosenthal/Desktop/REPOS/BuildGhost/Docs/release-policy.md)

## Module Work

If you are adding or wiring a new module into `ghostops-terminal`, follow the terminal integration contract instead of inventing a new pattern.

See:

- [`Docs/module-development-standard.md`](/Users/markrosenthal/Desktop/REPOS/BuildGhost/Docs/module-development-standard.md)

## Private Material

Do not commit private planning or roadmap material.

- `ROADMAP.md` is intentionally ignored
- private planning docs should stay out of tracked repo history
- if a document should never be public, do not rely on habit alone; keep it untracked

## Pull Request Checklist

- [ ] change is scoped and coherent
- [ ] docs reflect reality
- [ ] `CHANGELOG.md` updated if behavior changed
- [ ] `VERSION` updated only if release policy requires it
- [ ] no private planning material was added to tracked files

## Questions

For module integration details, read the module development standard first.
