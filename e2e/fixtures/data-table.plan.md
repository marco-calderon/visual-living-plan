---
title: Data table
summary: A data table edited as a table, with pills and chips in its cells.
mode: watch
---

# Data table

The routes the gateway serves.

<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="state" header="State" filter sort />
<Column id="owner" header="Owner" />
<Row>
<Cell>GET /health</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
</Row>
<Row>
<Cell>POST /api/keys</Cell>
<Cell value="open"><Pill tone="warning">open</Pill></Cell>
<Cell><Chip>platform</Chip></Cell>
</Row>
</DataTable>

<callout id="frozen" kind="note" title="Signed off">
These numbers are signed off.

<DataTable label="Frozen" locked>
<Column id="name" header="Name" />
<Row>
<Cell>Keep as is</Cell>
</Row>
</DataTable>
</callout>

<workflow id="flow" title="Flow">
```workflow
frozen | Signed off | frozen
--
```
</workflow>
