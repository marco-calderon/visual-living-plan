import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "../../client/ui/button.tsx";
import {
  dashboardSearchCss,
  highlightParts,
  hitHref,
  hitWhere,
  planOpenUrl,
  SEARCH_MIN_TYPED,
  SEARCH_THROTTLE_MS,
  searchSummary,
  throttle,
  versionLabel,
} from "../dashboardSearchView.ts";
import type { DashboardSearchPlan, DashboardSearchResponse } from "../planSearch.ts";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading"; previous: DashboardSearchResponse | null }
  | { kind: "error"; message: string }
  | { kind: "done"; result: DashboardSearchResponse };

type SearchOptions = { versions: boolean; any: boolean };

type TypedSearch = ReturnType<typeof throttle<[string, SearchOptions]>>;

/**
 * Search across this account's plans, by title and by content, with fuzzy matching. The Worker
 * runs the search; this field only sends the text. It searches while someone types, at most
 * once per SEARCH_THROTTLE_MS, and Enter searches at once. Live text only unless "Include saved
 * versions" is checked. While a search is shown, `onActiveChange(true)` lets the page hide its
 * plan table.
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
  const inFlight = useRef<AbortController | null>(null);
  const field = useRef<HTMLInputElement>(null);
  // The server cannot know the connection. Render online until the browser has mounted, so hydration matches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const offline = mounted && offlineNow;

  async function run(text: string, options: SearchOptions) {
    const trimmed = text.trim();
    if (!trimmed) {
      clear(false);
      return;
    }
    const mine = ++token.current;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const params = new URLSearchParams({ q: trimmed, fuzzy: "on" });
    if (options.versions) params.set("version", "all");
    if (options.any) params.set("match", "any");
    onActiveChange(true);
    // Keep the last results on screen, dimmed, until the new ones arrive.
    setState((current) => ({
      kind: "loading",
      previous: current.kind === "done" ? current.result : current.kind === "loading" ? current.previous : null,
    }));
    try {
      const response = await fetch(`/api/account/search?${params}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (mine !== token.current) return;
      if (!response.ok) {
        setState({ kind: "error", message: (await response.text()) || "Could not search the plans." });
        return;
      }
      const result = (await response.json()) as DashboardSearchResponse;
      if (mine === token.current) setState({ kind: "done", result });
    } catch {
      if (mine === token.current) setState({ kind: "error", message: "Could not search the plans." });
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  // The throttle is made once. It calls the newest `run`, so it reads this render's props.
  const latestRun = useRef(run);
  latestRun.current = run;
  const typed = useRef<TypedSearch | null>(null);
  if (!typed.current) {
    typed.current = throttle((text: string, options: SearchOptions) => void latestRun.current(text, options), SEARCH_THROTTLE_MS);
  }
  useEffect(
    () => () => {
      typed.current?.cancel();
      inFlight.current?.abort();
    },
    [],
  );

  function clear(focus: boolean) {
    typed.current?.cancel();
    inFlight.current?.abort();
    inFlight.current = null;
    token.current += 1;
    setQuery("");
    setState({ kind: "idle" });
    onActiveChange(false);
    if (focus) field.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    typed.current?.cancel();
    void run(query, { versions, any });
  }

  function change(value: string) {
    setQuery(value);
    const trimmed = value.trim();
    if (!trimmed) {
      if (state.kind !== "idle") clear(false);
      else typed.current?.cancel();
      return;
    }
    if (trimmed.length < SEARCH_MIN_TYPED) {
      typed.current?.cancel();
      return;
    }
    typed.current?.(value, { versions, any });
  }

  // A changed option reruns a search that is already shown.
  function toggle(next: SearchOptions) {
    setVersions(next.versions);
    setAny(next.any);
    if (state.kind !== "idle") {
      typed.current?.cancel();
      void run(query, next);
    }
  }

  const shown = state.kind !== "idle";
  const busy = state.kind === "loading";
  const visible = state.kind === "done" ? state.result : state.kind === "loading" ? state.previous : null;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: dashboardSearchCss() }} />
      <form className="dash-search" role="search" aria-label="Search plans" onSubmit={submit}>
        <span className="dash-search-box" data-busy={busy ? "" : undefined}>
          <span className="dash-search-icon" aria-hidden="true">
            <Search className="dash-search-glass" />
            <span className="dash-spinner" />
          </span>
          <input
            ref={field}
            className="dash-search-field"
            type="search"
            maxLength={200}
            placeholder={offline ? "Search needs a connection" : "Search plan titles and text"}
            aria-label="Search plans"
            autoComplete="off"
            disabled={offline}
            value={query}
            onChange={(event) => change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && (shown || query)) {
                event.stopPropagation();
                clear(false);
              }
            }}
          />
        </span>
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
        {shown ? (
          <span className="dash-search-actions">
            <Button type="button" variant="ghost" onClick={() => clear(true)}>
              Clear
            </Button>
          </span>
        ) : null}
      </form>
      {offline ? (
        <p className="dash-search-note">Search reads the plans on this host, so it needs a connection.</p>
      ) : null}
      {shown ? (
        <div>
          <div className="dash-search-note-row">
            <p className="dash-search-note" aria-live="polite">
              {state.kind === "loading"
                ? "Searching…"
                : state.kind === "error"
                  ? state.message
                  : state.kind === "done"
                    ? searchSummary(state.result)
                    : ""}
            </p>
            {state.kind === "error" ? (
              <Button type="button" variant="secondary" onClick={() => void run(query, { versions, any })}>
                Try again
              </Button>
            ) : null}
          </div>
          {visible ? (
            <SearchResults result={visible} busy={busy} />
          ) : busy ? (
            <SearchSkeleton />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function SearchSkeleton() {
  const card = (lines: number, key: number) => (
    <article className="dash-search-plan search-skeleton" aria-hidden="true" key={key}>
      <span className="dash-skeleton skel-heading" />
      <span className="dash-skeleton skel-label" />
      {Array.from({ length: lines }, (_, line) => (
        <span key={line}>
          <span className="dash-skeleton skel-where" />
          <span className="dash-skeleton skel-line" />
        </span>
      ))}
    </article>
  );
  return <div className="dash-search-results">{[card(2, 0), card(1, 1)]}</div>;
}

function Marked({ text, terms, ranges }: { text: string; terms: string[]; ranges?: Array<[number, number]> | null }) {
  return (
    <>
      {highlightParts(text, terms, ranges).map((part, at) =>
        part.match ? <mark key={at}>{part.text}</mark> : <span key={at}>{part.text}</span>,
      )}
    </>
  );
}

function PlanHeading({ plan }: { plan: DashboardSearchPlan }) {
  const title = plan.title || "Untitled plan";
  const matched = plan.titleMatched ?? [];
  const label = matched.length > 0 ? <Marked text={title} terms={matched} ranges={plan.titleRanges} /> : title;
  const href = planOpenUrl(plan);
  return <h3>{href ? <a href={href}>{label}</a> : label}</h3>;
}

function SearchResults({ result, busy }: { result: DashboardSearchResponse; busy: boolean }) {
  return (
    <div className="dash-search-results" aria-busy={busy ? "true" : undefined}>
      {result.plans.map((plan) => (
        <article className="dash-search-plan" key={plan.planId}>
          <PlanHeading plan={plan} />
          {plan.versions.length === 0 && (plan.titleMatched?.length ?? 0) > 0 ? (
            <span className="dash-search-title-match">Title match</span>
          ) : null}
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
                        <Marked text={hit.snippet} terms={result.terms} ranges={hit.ranges} />
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
