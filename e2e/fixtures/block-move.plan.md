---
title: Block move
mode: watch
---
# Block move

Every block on this page moves with its grip.

<phase id="build" title="Build the limiter" status="active">
Wire the limiter into the gateway.

Count rejects per route.

<callout kind="risk" title="Redis">
Redis can go away.
</callout>
</phase>

<phase id="agreed" title="Agreed rollout" status="done" locked>
Roll out to one percent first.

Then to everyone.
</phase>

<choice id="fail-mode" prompt="If Redis is unreachable, how should the limiter behave?">
<option id="open" label="Fail open">
Allow traffic if Redis is down.
</option>
<option id="closed" label="Fail closed">
Reject traffic if Redis is down.
</option>
</choice>

<FileTree title="Files touched">
<File path="src/limiter.ts" change="added">The sliding window.</File>
<File path="src/gateway.ts" change="modified">Calls the limiter first.</File>
</FileTree>

<workflow id="flow" title="Flow">
```workflow
build | Build the limiter | build
agreed | Agreed rollout | agreed
fail-mode | Choose fail mode | fail-mode
--
build -> agreed
agreed -> fail-mode
```
</workflow>
