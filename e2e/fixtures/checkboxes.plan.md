---
title: Checkboxes
summary: A markdown task list and a checklist written one item per line.
mode: watch
---

# Checkboxes

- [ ] Write the migration
- [x] Review the schema

<checklist id="done-when" title="Done when">
<item done="true">Schema reviewed</item>
<item done="false">Migration merged</item>
</checklist>

<workflow id="flow" title="Flow">
```workflow
done-when | Done when | done-when
--
```
</workflow>
