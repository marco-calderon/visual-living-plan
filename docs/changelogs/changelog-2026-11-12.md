# Changelog — 2026-11-12

## 2.25.1

**PR:** [#189](https://github.com/marco-calderon/visual-living-plan/pull/189)

**Bump:** patch

### Summary

Approve, Deny, and the other answer buttons on a plan work again while comments are on, so the agent hears the answer.

### Bugs fixed

- With comments on, in comment mode or in review, where comments start on, a click on an approve gate's Approve or Deny opened a comment instead. Nothing was sent, so the agent's `events` listener never saw the decision. A form's Submit, Send answers on questions, a choice option, and a note box failed the same way. Controls on a card now do their own job, and a click on the card's prompt or text still starts a comment.

### Notes

No plan format changes and no service restart needed. `SHELL_CACHE_VERSION` moves to 2.25.1.
