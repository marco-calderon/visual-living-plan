import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../client/ui/button.tsx";
import {
  dashboardSearchCss,
  highlightParts,
  hitHref,
  hitWhere,
  searchSummary,
  versionLabel,
} from "../dashboardSearchView.ts";
import type { DashboardSearchResponse } from "../planSearch.ts";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: DashboardSearchResponse };

/**
 * Search across this account's plans. Live text only unless "Include saved versions" is checked.
 * While a search is shown, `onActiveChange(true)` lets the page hide its plan table.
 */
export function DashboardSearch({
  offline: offlineNow,
  onActiveChange,
}: {
  offline: boolean;
  onActiveChange: (active: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [versions, setVersions] = useState(false);
  const [any, setAny] = useState(false);
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const token = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  // The server cannot know the connection. Render online until the browser has mounted, so hydration matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const offline = mounted && offlineNow;

  async function run(options: { versions: boolean; any: boolean } = { versions, any }) {
    const text = query.trim();
    if (!text) {
      clear(false);
      return;
    }
    const mine = ++token.current;
    const params = new URLSearchParams({ q: text });
    if (options.versions) params.set("version", "all");
    if (options.any) params.set("match", "any");
    onActiveChange(true);
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/account/search?${params}`, { credentials: "include", cache: "no-store" });
      if (mine !== token.current) return;
      if (!response.ok) {
        setState({ kind: "error", message: (await response.text()) || "Could not search the plans." });
        return;
      }
      setState({ kind: "done", result: (await response.json()) as DashboardSearchResponse });
    } catch {
      if (mine === token.current) setState({ kind: "error", message: "Could not search the plans." });
    }
  }

  function clear(focus: boolean) {
    token.current += 1;
    setQuery("");
    setState({ kind: "idle" });
    onActiveChange(false);
    if (focus) field.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run();
  }

  // A changed option reruns a search that is already shown.
  function toggle(next: { versions: boolean; any: boolean }) {
    setVersions(next.versions);
    setAny(next.any);
    if (state.kind !== "idle") void run(next);
  }

  const shown = state.kind !== "idle";
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: dashboardSearchCss() }} />
      <form className="dash-search" role="search" aria-label="Search plans" onSubmit={submit}>
        <input
          ref={field}
          className="dash-search-field"
          type="search"
          maxLength={200}
          placeholder={offline ? "Search needs a connection" : "Search plans"}
          aria-label="Search plans"
          autoComplete="off"
          disabled={offline}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim() && shown) clear(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && shown) {
              event.stopPropagation();
              clear(false);
            }
          }}
        />
        <label className="dash-search-option">
          <input
            type="checkbox"
            checked={versions}
            disabled={offline}
            onChange={(event) => toggle({ versions: event.target.checked, any })}
          />{" "}
          Include saved versions
        </label>
        <label className="dash-search-option">
          <input
            type="checkbox"
            checked={any}
            disabled={offline}
            onChange={(event) => toggle({ versions, any: event.target.checked })}
          />{" "}
          Match any term
        </label>
        <span className="dash-search-actions">
          <Button type="submit" variant="secondary" disabled={offline}>
            Search
          </Button>
          {shown ? (
            <Button type="button" variant="ghost" onClick={() => clear(true)}>
              Clear
            </Button>
          ) : null}
        </span>
      </form>
      {offline ? (
        <p className="dash-search-note">Search reads the plans on this host, so it needs a connection.</p>
      ) : null}
      {shown ? (
        <div>
          <p className="dash-search-note" aria-live="polite">
            {state.kind === "loading"
              ? "Searching…"
              : state.kind === "error"
                ? state.message
                : state.kind === "done"
                  ? searchSummary(state.result)
                  : ""}
          </p>
          {state.kind === "done" ? <SearchResults result={state.result} /> : null}
        </div>
      ) : null}
    </>
  );
}

function SearchResults({ result }: { result: DashboardSearchResponse }) {
  return (
    <div className="dash-search-results">
      {result.plans.map((plan) => (
        <article className="dash-search-plan" key={plan.planId}>
          <h3>{plan.url ? <a href={plan.url}>{plan.title || "Untitled plan"}</a> : plan.title || "Untitled plan"}</h3>
          {plan.versions.map((version) => (
            <section className="dash-search-version" key={String(version.seq)}>
              <span className={version.live ? "dash-search-version-label" : "dash-search-version-label saved"}>
                {versionLabel(version)}
              </span>
              <ul className="dash-search-hits">
                {version.hits.map((hit, index) => {
                  const href = hitHref(version, hit);
                  const body = (
                    <>
                      <span className="dash-search-where">{hitWhere(hit)}</span>
                      <span className="dash-search-snippet">
                        {highlightParts(hit.snippet, result.terms).map((part, at) =>
                          part.match ? <mark key={at}>{part.text}</mark> : <span key={at}>{part.text}</span>,
                        )}
                      </span>
                    </>
                  );
                  return (
                    <li key={`${hit.line}-${index}`}>
                      {href ? (
                        <a className="dash-search-hit" href={href}>
                          {body}
                        </a>
                      ) : (
                        <div className="dash-search-hit">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </article>
      ))}
    </div>
  );
}
