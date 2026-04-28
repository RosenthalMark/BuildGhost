# BuildGhost Release Policy

## Purpose
This policy defines when to bump `VERSION` and how to update `CHANGELOG.md`.

## Source of Truth
- `VERSION` (repo root): current release version (`MAJOR.MINOR.PATCH`).
- `CHANGELOG.md` (repo root): canonical running release history.

## Decision Matrix
1. Did this PR change observable behavior?
- No: version bump is usually not required.
- Yes: add a `CHANGELOG.md` entry.

2. Is the change release-worthy?
- No: no version bump required.
- Yes: bump version using rules below.

## Version Bump Rules
- `PATCH` (`x.y.z -> x.y.(z+1)`):
  - Bug fix
  - Hotfix
  - Small correction
  - Non-breaking adjustment
- `MINOR` (`x.y.z -> x.(y+1).0`):
  - New feature
  - New capability
  - Additive, backward-compatible behavior
- `MAJOR` (`x.y.z -> (x+1).0.0`):
  - Breaking behavior change
  - Removed/renamed contract
  - Schema/API changes requiring migration

## Required File Updates
- If behavior changes: update `CHANGELOG.md`.
- If version changes: update both `VERSION` and `CHANGELOG.md` in the same PR.

## Changelog Rules
- Append entries to existing `CHANGELOG.md`.
- Do not create a new changelog file.
- Keep entries concise and user-impact focused.

## PR Checklist
- [ ] Behavior changed? If yes, `CHANGELOG.md` updated.
- [ ] Version bump needed? If yes, `VERSION` + `CHANGELOG.md` updated together.
- [ ] Bump type selected correctly (`PATCH` / `MINOR` / `MAJOR`).

## Examples
- Fix flaky selector capture dedupe logic (no breaking changes) -> `PATCH`.
- Add new Trace replay panel and supporting runtime path (non-breaking additive) -> `MINOR`.
- Replace snapshot schema in a way older modules cannot read without migration -> `MAJOR`.
