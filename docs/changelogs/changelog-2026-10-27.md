# Changelog — 2026-10-27

## 0.2.2

**PR:** (opened with this release)

**Bump:** patch

### Summary

Contributor workflow for version bumps and changelogs, plus a clearer local global install path.

### Changes

- Add the `version-bump` project skill (`.cursor/skills/version-bump/`) with an in-skill changelog template; files land in `docs/changelogs/changelog-yyyy-mm-dd.md`.
- Point root `AGENTS.md` at that skill.
- Simplify `scripts/build-cli.mjs` into numbered steps and add `npm run install:global` (`build` then `npm install -g .`).

### Notes

No registry restart needed.
