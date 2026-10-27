# ADR 0017: Machine config lives under ~/.config/living-plan

- Status: Accepted
- Date: 2026-10-27

## Context

The service stored lock file, SQLite, and plan copies in `~/.visual-living-plan` (`LIVE_PLAN_HOME`). Diagnostic logs used a second home, `~/.living-plan` (`LIVE_PLAN_LOG_HOME`). `live-plan theme` without `--plan` or `--config` wrote `live-plan.config.json` in the current working directory. Those paths were easy to miss, split state across two directories, and made CWD affect theme edits that were not tied to a plan file.

## Decision

One XDG-style config directory holds machine state:

- Default home: `$XDG_CONFIG_HOME/living-plan`, or `~/.config/living-plan` when `XDG_CONFIG_HOME` is unset.
- Registry lock, SQLite, archived plan copies, and the daemon `registry.log` sit in that directory.
- Diagnostic logs sit in `logs/` under that directory (`logs/registry/YYYY-MM-DD.log`, `logs/plans/<id>.log`).
- `LIVE_PLAN_HOME` and `LIVE_PLAN_LOG_HOME` still override those defaults (tests and operators).
- Per-plan accent theme stays in `live-plan.config.json` **beside the plan file** when `serve` / `review` run, or when `theme` is given `--plan`. That is intentional per-plan storage and does not move into the config home.
- `theme get|set` without `--plan` / `--config` / `--url` uses `~/.config/living-plan/live-plan.config.json`. Reads still accept a leftover CWD `live-plan.config.json`; writes go to the config home.

### Migration

| Old location | New location |
|---|---|
| `~/.visual-living-plan/` (registry.json, registry.sqlite, plans/, registry.log) | `~/.config/living-plan/` |
| `~/.living-plan/` (registry/, plans/ logs) | `~/.config/living-plan/logs/` |
| CWD `live-plan.config.json` (theme without `--plan`) | `~/.config/living-plan/live-plan.config.json` (writes); CWD still read if present |
| Plan-adjacent `live-plan.config.json` | Unchanged |

If `~/.config/living-plan` has no registry state and `~/.visual-living-plan` does, contents are moved into the new home when that legacy lock is not a live process. A running legacy service keeps using the old home until it stops, so an upgrade does not start a second registry under the new path. Idle legacy log trees are moved the same way into `logs/`.

## Consequences

Agents and docs point at one tree under `~/.config/living-plan`. Operators who already run a service from `~/.visual-living-plan` keep that process until the next clean stop; the following start migrates. Plan-local theme files next to `.plan.md` stay where authors expect them.
