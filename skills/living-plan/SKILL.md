---
name: living-plan
description: >-
  Deprecated path. Use the live-plan skill at skills/live-plan/SKILL.md to
  author a living plan with bunx visual-living-plan or the live-plan command,
  including the required workflow block. That block is the execution path.
  Loopback stays the default host. `live-plan account login` and `serve --cloud`
  use the signed-in cloud host.
---

# Moved

This skill now lives at [../live-plan/SKILL.md](../live-plan/SKILL.md).

Invoke with `bunx visual-living-plan` or, when installed, `live-plan` (`living-plan` is the same binary). The CLI runs on Bun. Loopback stays the default host. `live-plan account login --url https://<host>` and `live-plan serve path/to/work.plan.md --cloud` use the signed-in cloud host. Flags for that host are in [../live-plan/SKILL.md](../live-plan/SKILL.md). Primitive schemas, including `workflow`, are in [../live-plan/primitives.md](../live-plan/primitives.md). The agent guideline is [docs/agent-guidelines.md](../../docs/agent-guidelines.md).
