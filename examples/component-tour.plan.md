---
title: Component tour
summary: Every block a plan can hold, on one page, for design review.
agent: local-claude
mode: watch
---

# Component tour

This plan rate-limits the public API. It exists to show every block a plan can hold, in the document-first style: prose first, with data cards only where the content has its own format.

<Update health="on-track" by="Agent" date="2026-11-13">
Limiter and middleware are merged behind a flag. The load test is next and needs a staging key.
</Update>

<Properties>
<Prop label="Owner">Gateway team</Prop>
<Prop label="Flag"><Chip>rate-limit-v2</Chip></Prop>
<Prop label="Target">20 November 2026</Prop>
</Properties>

<phase id="design" title="Confirm the limiter design" status="done">
A token bucket per API key, stored in Redis and shared by every gateway instance. The gate lives in <Path change="modified" lines="42-58">src/gateway/middleware.ts</Path>.

<Compare>
<Pane label="Before">
Every request reaches the handler, so one key can starve the others.
</Pane>
<Pane label="After">
Over the limit returns `429` with a `Retry-After` header.
</Pane>
</Compare>
</phase>

<phase id="implement" title="Implement the gateway middleware" status="active">
The files this change touches:

<FileTree title="Files touched">
<File path="src/gateway/limiter.ts" change="added">Token bucket per API key.</File>
<File path="src/gateway/middleware.ts" change="modified">Calls the limiter before the handler.</File>
<File path="src/gateway/throttle.ts" change="deleted">Replaced by the limiter.</File>
<File path="docs/limits.md" from="docs/rate-limits.md" change="renamed" />
<File path="test/limiter.test.ts" change="added" />
</FileTree>

<AnnotatedCode title="src/gateway/middleware.ts" start="40">
```ts
export async function gate(req: Request, reply: Reply) {
  const key = req.headers['x-api-key']
  if (await limiter.over(key)) {
    return reply.code(429).header('Retry-After', 12).send()
  }
  return next()
}
```
<Note lines="42" label="Before auth">The limiter runs before the session lookup, so a flood never reaches the database.</Note>
<Note lines="43">Retry-After is in whole seconds.</Note>
</AnnotatedCode>

<Tabs label="Limiter files">
<Tab label="limiter.ts">
The bucket refills at `perMinute / 60` tokens a second.
</Tab>
<Tab label="limiter.test.ts">
Tests cover the 429 path and the refill.
</Tab>
</Tabs>
</phase>

<phase id="api" title="Expose the limit in the admin API" status="pending">
Two new endpoints. Both need an admin API key.

<Endpoint method="POST" path="/api/keys/{keyId}/limit" change="added" auth="Admin API key" open>
Set the request limit for one key.

<Param name="keyId" in="path" type="string" required>Key to update.</Param>
<Param name="perMinute" in="body" type="integer" required>Requests per minute, 1–10000.</Param>

<Request>
```json
{ "perMinute": 600 }
```
</Request>

<Response status="200">Limit saved.</Response>
<Response status="404">No key with this id.</Response>
</Endpoint>

<Endpoint method="GET" path="/api/keys/{keyId}/limit" change="added" auth="Admin API key">
Read the current limit.

<Response status="200">The limit and the tokens left.</Response>
</Endpoint>

<JsonView title="429 response">
```json
{
  "error": "rate_limited",
  "retryAfter": 12,
  "fallback": false,
  "limit": { "perMinute": 600, "remaining": 0 },
  "keys": ["k_1", "k_2", "k_3"]
}
```
</JsonView>

<DataModel title="Limiter tables">
<Entity name="rate_limits" change="added">
<Attr name="key_id" type="text" pk fk="api_keys.id" />
<Attr name="per_minute" type="integer" />
<Attr name="updated_at" type="timestamptz" nullable />
</Entity>
<Entity name="api_keys">
<Attr name="id" type="text" pk />
<Attr name="owner_id" type="text" fk="users.id" />
</Entity>
<Relation from="api_keys" to="rate_limits" kind="1-1" />
</DataModel>
</phase>

<callout kind="risk" title="Redis dependency" icon="alert">
A Redis outage must not take down the API. The limiter fails open and logs a warning.
</callout>

<callout kind="decision" title="Bucket store" locked>
Redis, shared by every gateway instance. Agreed with the gateway team on 12 November.
</callout>

<checklist id="done-when" title="Done when">
<item done="true">Token bucket in limiter.ts</item>
<item status="active">Write the limiter tests</item>
<item status="blocked">Load test in staging</item>
<item>Document the limits</item>
</checklist>

<choice id="fail-mode" prompt="If Redis is unreachable, what should the limiter do?">
<option id="open" label="Fail open" recommended>
Allow traffic and log a warning.
</option>
<option id="closed" label="Fail closed">
Return 429 until Redis recovers.
</option>
</choice>

<questions id="rollout-notes" prompt="Anything else before coding?">
<item>
Which environments should get the flag first?
</item>
</questions>

<approve id="proceed" prompt="Proceed with the rollout?">
The flag turns on in staging first, then production.
</approve>

<workflow id="flow" title="Expected execution">
```workflow
design | Confirm the limiter design | design
implement | Implement the gateway middleware | implement
api | Expose the limit in the admin API | api
fail-mode | Pick the failure mode | fail-mode
proceed | Approve the rollout | proceed
--
design -> implement
implement -> api
api -> fail-mode
fail-mode -> proceed
```
</workflow>
