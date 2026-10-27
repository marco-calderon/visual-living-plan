---
name: version-bump
description: >-
  Bump visual-living-plan semver and add a docs/changelogs entry when a PR
  ships user-facing or package changes. Use before opening or updating that PR.
---

# Version bump

Every PR that ships **user-facing** or **package** changes must:

1. Bump `package.json` (and the lockfile version) with semver.
2. Add or update a changelog under `docs/changelogs/`.

Skip both when the PR is docs-only, test-only, or internal refactor with no
behavior or packaging change.

## When to bump

| Change | Bump |
|---|---|
| Bug fix, small UX tweak, install/script clarity, skill or guideline for this repo | **patch** (`0.2.1` → `0.2.2`) |
| New feature, new CLI command/flag, notable UX, additive package surface | **minor** (`0.2.1` → `0.3.0`) |
| Breaking CLI, API, plan schema, or install contract | **major** (`0.2.1` → `1.0.0`) |

Bump once per PR. Prefer the highest tier that applies. Keep the version in
`package-lock.json` in sync (`npm version <patch|minor|major> --no-git-tag-version`
is fine).

Do **not** restart Marco’s plan registry as part of a version bump.

## Changelog file

Path: `docs/changelogs/changelog-yyyy-mm-dd.md`

- Use the date the PR is opened (or the day the bump lands), local calendar date.
- One file per day. If that day’s file already exists, **append** a new section
  for this version; do not overwrite earlier entries.
- Lead with the new version. Keep entries short and user-facing.

## Changelog template

Copy this into a new file (or append a section). Fill every field.

```markdown
# Changelog — YYYY-MM-DD

## X.Y.Z

**PR:** #<number> (or link once known)

**Bump:** patch | minor | major

### Summary

One or two sentences: what a user or installer gets from this release.

### Changes

- …
- …

### Notes

Optional. Migration, follow-ups, or “no registry restart needed.”
```

## Checklist before the PR

- [ ] Semver matches the change (patch / minor / major).
- [ ] `package.json` `version` updated; lockfile version matches.
- [ ] `docs/changelogs/changelog-yyyy-mm-dd.md` added or appended from the template.
- [ ] PR description mentions the version and points at the changelog.
- [ ] No unrelated layout or registry work mixed into the bump commit.
