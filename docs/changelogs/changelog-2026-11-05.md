# Changelog — 2026-11-05

## 2.3.2

**PR:** pending

**Bump:** patch

### Summary

The workflow diagram now follows the state of the plan, the same way plan progress does. Answered steps and a live run's progress show on the workflow, not only on the phases and the progress bar.

### Bugs fixed

- A workflow step linked to a choice, form, question, or approval stayed pending after it was answered, while progress counted it as done. It now turns done as soon as the answer arrives, on local and hosted plans.
- Answering an interaction did not refresh the Workflow tab. The local service and the hosted plan now send the updated workflow with each answer.
- A status written on a workflow node hid the status of the phase it links to. The step now shows whichever of the two is further along.
- A live run could show a plan step as less finished than its phase, for example active on a phase marked done, while progress kept the phase done. A step linked to the plan now keeps the further along status, the same rule progress uses. A step that links to nothing in the plan still shows the run status.
- On a hosted plan, an `execution push` sent browsers the run without the plan's workflow, so the Workflow tab lost the plan's steps until the page reloaded. It now sends the same view `GET /api/execution` returns.

### Notes

No registry restart needed beyond the usual version check. The shell cache name is 2.3.2.
