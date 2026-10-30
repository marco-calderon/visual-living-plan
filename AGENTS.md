# Agent instructions

Project context for changing this repo: [docs/context.md](docs/context.md).
Architecture: [docs/architecture/README.md](docs/architecture/README.md).
Design system: [DESIGN.md](DESIGN.md).
Authoring living plans (consumers): [skills/live-plan/SKILL.md](skills/live-plan/SKILL.md).

## Project skills

| Skill | When |
|---|---|
| [version-bump](.cursor/skills/version-bump/SKILL.md) | Before opening a PR that ships user-facing or package changes — bump semver and add `docs/changelogs/changelog-yyyy-mm-dd.md` |

Follow that skill for every qualifying PR. Changelogs use the template defined inside the skill.

`npm run skills:install` copies the project skills (`skills/` and `.cursor/skills/`) into `~/.agents/skills`. Run it again to refresh those copies. It leaves other skills in that folder in place.
