---
title: Cell comments
summary: Comment on one markdown cell and one data table cell.
mode: watch
---

# Cell comments

A paragraph stays selectable.

| Status | Meaning |
| --- | --- |
| PENDING | Waiting |

<phase id="owners" title="Owners" status="done">
Owners intro.

<DataTable label="Owners">
<Column id="name" header="Name" search sort />
<Column id="state" header="State" />
<Row>
<Cell>Gateway</Cell>
<Cell>succeeded</Cell>
</Row>
<Row>
<Cell>Limits</Cell>
<Cell>running</Cell>
</Row>
</DataTable>
</phase>

<workflow id="cell-comments" title="Expected execution">
```workflow
owners | Owners | owners
--
```
</workflow>
