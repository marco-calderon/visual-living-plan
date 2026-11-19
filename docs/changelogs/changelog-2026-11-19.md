# Changelog — 2026-11-19

## 2.32.1

**PR:** Link once known

**Bump:** patch

### Summary

The comment popover reads at the page's normal body size. Its messages, replies, and the message box were set at 10–13px, smaller than the rest of the plan.

### Improvements

- Comments, agent replies, and the *Message for the agent* box in the comment popover are 14px, the same as the agent chat. The title and the excerpt use the popover's usual sizes, *Pending*, *Addressing*, *Addressed*, and *Mark addressed* are 12px, and an error under the box is 13px. The thread shows more before it scrolls.

### Notes

`SHELL_CACHE_VERSION` moves to 2.32.1. No registry restart needed.
