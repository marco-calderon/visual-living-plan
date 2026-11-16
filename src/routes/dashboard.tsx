import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { openQuestions, planActivity, type DashboardPeriod, type DashboardSummary } from "../dashboard.ts";
import {
  agentLine,
  completionLabel,
  DASHBOARD_FILTERS,
  dashboardStatusLine,
  durationPhrase,
  emptyPlansText,
  formatDuration,
  formatWhen,
  outcomeLabel,
  plansCountText,
  progressDetail,
  questionsText,
  safeHttpUrl,
  startedText,
  statusLabel,
  statusSegments,
  visiblePlans,
  type DashboardFilter,
} from "../dashboardFormat.ts";
import { agentSeenAgo } from "../agentPresence.ts";
import { ACTIVITY_GLYPH_SVG, dashboardOverviewCss, OVERVIEW_CARDS, progressTone } from "../dashboardOverview.ts";
import { Button } from "../../client/ui/button.tsx";
import { HostBar } from "../HostBar.tsx";
import { loadAccount, type AccountPayload } from "../planFns.ts";
import type { PlanRecord } from "../processRecord.ts";
import { PlanRowActions } from "./PlanRowActions.tsx";
import { DashboardSearch } from "./DashboardSearch.tsx";
import { dashboardLoadingCss, ROW_SKELETON_WIDTHS } from "../dashboardLoading.ts";
import { startOfflineEngine } from "../../client/offline/engine.ts";
import { refreshDeviceDashboards } from "../../client/offline/warmPlans.ts";
import { dashboardAccountDecision, isAccountNetworkFailure } from "../offlineSync.ts";
import "./dashboard.css";
import { Bot, BotOff, RefreshCcw } from "lucide-react";

const LEDE =
  "Hosted plans for this account. Summaries follow the local day, week, and month. Each published version is stored on this host, and the latest 10 are kept. Loopback plans stay on your machine.";

const PERIODS: Array<{ id: DashboardPeriod; label: string; aria?: string }> = [
  { id: "day", label: "Today" },
  { id: "week", label: "Week", aria: "This week" },
  { id: "month", label: "Month", aria: "This month" },
];

const FILTERS = DASHBOARD_FILTERS;

const PERIOD_PHRASE: Record<DashboardPeriod, string> = { day: "today", week: "this week", month: "this month" };

type DashboardSearch = { period?: DashboardPeriod };

type DashboardPlan = PlanRecord & { fileUrl?: string; historyUrl?: string };

type DashboardBody = {
  summary: DashboardSummary;
  plans: DashboardPlan[];
};

/** enter: the first rows rise in. swap: the table's header and rows fade in place. quiet: polls repaint without motion. */
type Shift = "enter" | "swap" | "quiet";

const DASHBOARD_POLL_MS = 4000;

type DashboardResult = { body: DashboardBody; savedAt: number; offline: boolean };

function dashboardKey(period: DashboardPeriod) {
  return ["account-dashboard", period] as const;
}

/** Network first, then this device's copy. Throws only when neither is there. */
async function readDashboard(period: DashboardPeriod): Promise<DashboardResult> {
  const engine = await startOfflineEngine();
  const result = await refreshDeviceDashboards(engine, { period, force: true });
  if ("missing" in result) throw new Error("Could not read the dashboard.");
  return { body: result.body as DashboardBody, savedAt: result.savedAt, offline: result.offline };
}

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => {
    const period = search.period;
    if (period === "day" || period === "week" || period === "month") return { period };
    return {};
  },
  loader: async () => {
    const browser = typeof window !== "undefined";
    const online = browser ? navigator.onLine : true;
    try {
      const result = await loadAccount();
      if (
        !result.ok ||
        dashboardAccountDecision({ ok: result.ok, networkFailure: false, hasStored: false }) ===
          "login"
      ) {
        throw redirect({ to: "/login", search: { next: "/dashboard" } });
      }
      if (browser) {
        const engine = await startOfflineEngine();
        engine?.rememberAccount(result.account);
      }
      return result.account;
    } catch (error) {
      if (isRedirect(error) || !browser || !isAccountNetworkFailure(error, online)) throw error;
      const engine = await startOfflineEngine();
      const stored = engine?.account()?.payload;
      if (!isAccountPayload(stored)) throw error;
      return stored;
    }
  },
  // Opening settings only changes the search. Keep the loaded page.
  shouldReload: ({ cause }) => cause !== 'stay',
  component: DashboardPage,
});

function DashboardPage() {
  const account = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const period = search.period ?? "day";
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [searching, setSearching] = useState(false);
  const [shift, setShift] = useState<Shift>("enter");
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const queryClient = useQueryClient();

  // Polls every 4 s while the tab is visible and online. React Query pauses the interval while the
  // tab is hidden and refreshes once when it is shown again. A failed refresh keeps the last rows.
  const dashboard = useQuery({
    queryKey: dashboardKey(period),
    queryFn: () => readDashboard(period),
    refetchInterval: () => (navigator.onLine ? DASHBOARD_POLL_MS : false),
    // The query reads this device's copy itself when the network is down.
    networkMode: "always",
    // A new period keeps the last numbers on screen, dimmed, until its own arrive.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    let cancelled = false;
    /** Show this device's saved copy right away, before the network answers. */
    void startOfflineEngine().then((engine) => {
      const saved = engine?.dashboard(period);
      if (cancelled || !saved || queryClient.getQueryData(dashboardKey(period))) return;
      // updatedAt 0 keeps it stale, so the network read in flight still replaces it.
      queryClient.setQueryData<DashboardResult>(
        dashboardKey(period),
        {
          body: saved.payload as DashboardBody,
          savedAt: saved.savedAt,
          offline: !navigator.onLine,
        },
        { updatedAt: 0 },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [period, queryClient]);

  useEffect(() => {
    function onOnline() {
      setOnline(true);
    }
    function onOffline() {
      setOnline(false);
      // Switch to this device's copy and its "Offline" line right away.
      void queryClient.refetchQueries({ queryKey: ["account-dashboard"] });
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [queryClient]);

  const payload = dashboard.data?.body ?? null;
  const error = dashboard.isError ? "Could not read the dashboard." : "";
  const offlineAt = !dashboard.isError && dashboard.data?.offline ? dashboard.data.savedAt : null;
  // The rows on screen belong to the period before this one. Its own are on the way.
  const switching = dashboard.isPlaceholderData && !dashboard.isError;

  // The shift plays when the new rows arrive, not while the old ones wait. Each filter starts the
  // window again, so a quick run of filters fades every set.
  useEffect(() => {
    if (!payload || shift === "quiet" || switching) return;
    const timer = window.setTimeout(() => setShift("quiet"), 240);
    return () => window.clearTimeout(timer);
  }, [payload, shift, switching, filter]);

  // Refresh fades the rows in the commit that brings them, before paint, rather than whenever the
  // await resumes, which React may render apart from the new rows.
  const swapOnRead = useRef(false);
  useLayoutEffect(() => {
    if (!swapOnRead.current) return;
    swapOnRead.current = false;
    setShift("swap");
  }, [dashboard.dataUpdatedAt]);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    swapOnRead.current = true;
    try {
      const result = await dashboard.refetch();
      if (!result.isSuccess) swapOnRead.current = false;
    } finally {
      setRefreshing(false);
    }
  }

  // The period whose rows are on screen. The table swaps in the commit where the new period's rows
  // show, from the cache at once or after the dimmed wait, so the click itself never animates the
  // old rows, however late the router commits the new search.
  const shownPeriod = useRef(period);
  useLayoutEffect(() => {
    if (switching || shownPeriod.current === period) return;
    shownPeriod.current = period;
    setShift("swap");
  }, [period, switching]);

  function choosePeriod(next: DashboardPeriod) {
    if (next === period) return;
    void navigate({ to: "/dashboard", search: { period: next }, replace: true });
  }

  function chooseFilter(next: DashboardFilter) {
    if (next === filter) return;
    setShift("swap");
    setFilter(next);
  }

  /** Hide a plan from this account's dashboard. The plan and its versions stay stored. False when the request failed. */
  async function deletePlan(plan: DashboardPlan): Promise<boolean> {
    const response = await fetch(`/api/account/plans/${encodeURIComponent(plan.id)}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => null);
    if (!response?.ok) return false;
    setShift("swap");
    // Drop the row now. The next read confirms it.
    queryClient.setQueriesData<DashboardResult>({ queryKey: ["account-dashboard"] }, (current) =>
      current
        ? { ...current, body: { ...current.body, plans: current.body.plans.filter((row) => row.id !== plan.id) } }
        : current,
    );
    void queryClient.invalidateQueries({ queryKey: ["account-dashboard"] });
    return true;
  }

  const plans = payload?.plans ?? [];
  const shown = visiblePlans(plans, filter);
  const offline = !online || offlineAt !== null;
  const loading = !payload && !error;
  const status = switching
    ? `Loading ${PERIOD_PHRASE[period]}…`
    : offlineAt
      ? `Offline · updated ${formatWhen(offlineAt)}`
      : error || (payload ? dashboardStatusLine(payload.summary) : "Loading plans…");
  // Open plans first, then finished runs, each under its heading when both are shown.
  const openPlans = shown.filter((plan) => plan.status === "running");
  const finishedPlans = shown.filter((plan) => plan.status !== "running");
  const groups: Array<{ label: string; plans: DashboardPlan[] }> =
    openPlans.length && finishedPlans.length
      ? [
          { label: "Open", plans: openPlans },
          { label: "Finished", plans: finishedPlans },
        ]
      : [{ label: "", plans: shown }];

  return (
    <>
      <HostBar title="Dashboard" label={account.user.name || account.user.email} />
      <style dangerouslySetInnerHTML={{ __html: dashboardLoadingCss() + dashboardOverviewCss() }} />
      <main className="dashboard">
        <div className="dashboard-live" data-shift={switching ? "quiet" : shift}>
          <section className="dash-section" aria-label="Summary">
            <div className="period-bar">
              <div className="tabs" role="group" aria-label="Summary period">
                {PERIODS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    className="tab-label"
                    aria-pressed={period === item.id}
                    aria-label={item.aria}
                    onClick={() => choosePeriod(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              <div className="dash-status-row">
                <p className="status">{status}</p>
                {loading || switching ? <span className="dash-spinner" aria-hidden="true" /> : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="titlebar-action"
                aria-busy={refreshing || undefined}
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                <RefreshCcw className={refreshing ? "dash-spin" : undefined} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            <section
              className={switching ? "dash-overview dash-pending" : "dash-overview"}
              aria-label="Summary for the period"
              aria-live="polite"
              aria-busy={loading || switching || undefined}
            >
              {loading ? <OverviewSkeletons /> : payload ? <Overview summary={payload.summary} /> : null}
            </section>
          </section>
          <section className="dash-section" aria-label="Plans">
            <div className="section-bar">
              <div className="tabs" role="group" aria-label="Plan status">
                {FILTERS.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    className="tab-label"
                    aria-pressed={filter === item.id}
                    onClick={() => chooseFilter(item.id)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
            <DashboardSearch offline={offline} onActiveChange={setSearching} />
            <div
              className={switching ? "table-wrap dash-pending" : "table-wrap"}
              hidden={searching}
              aria-busy={loading || switching || undefined}
            >
              <table>
                <caption>
                  Plans
                  {payload ? <span className="caption-count">{plansCountText(shown.length, plans.length, filter)}</span> : null}
                </caption>
                {/* Keyed by filter so each filter in a quick run fades its own rows in. */}
                <thead key={`head-${filter}`}>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress</th>
                    <th scope="col">Started</th>
                    <th scope="col">
                      <span className="dash-sr">Actions</span>
                    </th>
                  </tr>
                </thead>
                {loading ? (
                  <tbody key={`body-${filter}`}>
                    <RowSkeletons />
                  </tbody>
                ) : !payload ? (
                  <tbody key={`body-${filter}`}>
                    <tr>
                      <td className="empty" colSpan={5}>
                        Could not read the dashboard.
                        <Button type="button" variant="secondary" className="dash-retry" onClick={() => void refresh()}>
                          Try again
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                ) : shown.length === 0 ? (
                  <tbody key={`body-${filter}`}>
                    <tr>
                      <td className="empty" colSpan={5}>
                        {emptyPlansText(filter, period)}
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  groups.map((group) => (
                    <tbody key={`body-${filter}-${group.label}`}>
                      {group.label ? (
                        <tr className="plan-group">
                          <th scope="rowgroup" colSpan={5}>
                            {group.label}
                            <span>{group.plans.length}</span>
                          </th>
                        </tr>
                      ) : null}
                      {group.plans.map((plan) => (
                        <PlanRow key={plan.id} plan={plan} offline={offline} onDelete={() => deletePlan(plan)} />
                      ))}
                    </tbody>
                  ))
                )}
              </table>
            </div>
          </section>
          <p className="lede dash-footnote">{LEDE}</p>
        </div>
      </main>
    </>
  );
}

function isAccountPayload(value: unknown): value is AccountPayload {
  if (!value || typeof value !== "object") return false;
  const user = (value as { user?: { email?: unknown } }).user;
  return Boolean(user && typeof user.email === "string");
}

/** Placeholder cards while the first numbers load, shaped like the summary cards. */
function OverviewSkeletons() {
  return (
    <>
      {Array.from({ length: OVERVIEW_CARDS }, (_, index) => (
        <article
          className={index === 0 ? "dash-card dash-card-skeleton dash-card-plans" : "dash-card dash-card-skeleton"}
          aria-hidden="true"
          key={index}
        >
          <span className="dash-skeleton skel-eyebrow" />
          <span className="dash-skeleton skel-figure" />
          {index === 0 ? <span className="dash-skeleton skel-bar" /> : null}
          <span className="dash-skeleton skel-line" />
          {index === 0 ? null : <span className="dash-skeleton skel-line" />}
        </article>
      ))}
    </>
  );
}

/** Placeholder rows shaped like plan rows: title, status pill, meter, start time. */
function RowSkeletons() {
  return (
    <>
      {ROW_SKELETON_WIDTHS.map((width, index) => (
        <tr className="row-skeleton" aria-hidden="true" key={index}>
          <td className="plan-cell">
            <span className="dash-skeleton skel-title" style={{ width: width.title }} />
            <span className="dash-skeleton skel-sub" style={{ width: width.sub }} />
            <span className="dash-skeleton skel-sub" style={{ width: width.path }} />
          </td>
          <td>
            <span className="dash-skeleton skel-pill" />
          </td>
          <td>
            <span className="dash-skeleton skel-meter" />
            <span className="dash-skeleton skel-sub" style={{ width: "96px" }} />
          </td>
          <td className="plan-time-cell">
            <span className="dash-skeleton skel-sub" style={{ width: width.when }} />
          </td>
          <td className="plan-actions-cell" />
        </tr>
      ))}
    </>
  );
}

function count(value: number | null | undefined): string {
  return (Number(value) || 0).toLocaleString();
}

function ofCount(done: number | null | undefined, total: number | null | undefined): string {
  return `${count(done)} of ${count(total)}`;
}

function Figure({ value, caption, hero = false }: { value: string; caption: string; hero?: boolean }) {
  return (
    <p className={hero ? "dash-figure hero" : "dash-figure"}>
      <strong>{value}</strong>
      <span>{caption}</span>
    </p>
  );
}

function Facts({ entries }: { entries: Array<[string, string]> }) {
  return (
    <dl className="dash-facts">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A trusted icon string from src/dashboardOverview.ts. */
function Glyph({ svg }: { svg: string }) {
  return <span className="dash-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/**
 * Three cards: the period's plans by status, what is open and waiting on the person now, and the
 * work the runs did. A hosted plan has no folder or git change set, so Work leaves those out.
 */
function Overview({ summary }: { summary: DashboardSummary }) {
  const segments = statusSegments(summary);
  const total = segments.reduce((sum, part) => sum + part.count, 0);
  const parts = segments.filter((part) => part.count > 0);
  const questions = Number(summary.questions) || 0;
  return (
    <>
      <article className="dash-card dash-card-plans">
        <h2 className="dash-eyebrow">Plans</h2>
        <Figure value={count(summary.plans ?? total)} caption={startedText(summary)} hero />
        <div
          className="dash-seg"
          role="img"
          aria-label={total ? `Plans by status: ${segments.map((part) => `${part.label} ${part.count}`).join(", ")}` : "No plans"}
        >
          {parts.length === 0 ? (
            <span className="dash-seg-part empty" />
          ) : (
            parts.map((part) => (
              <span
                key={part.id}
                className="dash-seg-part"
                data-activity={part.id}
                style={{ "--dash-count": String(part.count) } as CSSProperties}
                title={`${part.label} · ${part.count} of ${total} (${part.share}%)`}
              />
            ))
          )}
        </div>
        <ul className="dash-legend">
          {segments.map((part) => (
            <li key={part.id} data-activity={part.id}>
              <span className="dash-swatch" aria-hidden="true" />
              {part.label} <strong>{count(part.count)}</strong>
            </li>
          ))}
        </ul>
      </article>
      <article className="dash-card">
        <h2 className="dash-eyebrow">Open now</h2>
        <Figure value={count(questions)} caption={questions === 1 ? "question waiting on you" : "questions waiting on you"} />
        <Facts
          entries={[
            ["Open plans", count(summary.running)],
            ["Plans waiting on you", count(summary.waiting)],
            ["Agents connected", ofCount(summary.active, summary.running)],
          ]}
        />
      </article>
      <article className="dash-card">
        <h2 className="dash-eyebrow">Work</h2>
        <Figure value={formatDuration(summary.durationMs)} caption="execution time" />
        <Facts
          entries={[
            ["Phases done", ofCount(summary.phaseDone, summary.phaseTotal)],
            ["Answers given", ofCount(summary.interactionDone, summary.interactionTotal)],
          ]}
        />
      </article>
    </>
  );
}

function BrokenPath({ value, className }: { value: string; className: string }) {
  const parts = value.split("/");
  return (
    <span className={className}>
      {parts.map((part, index) => (
        <span key={`${index}-${part}`}>
          {index > 0 ? (
            <>
              /
              <wbr />
            </>
          ) : null}
          {part}
        </span>
      ))}
    </span>
  );
}

/** A robot while an agent is connected, a struck-through robot while not. The words are the tooltip. */
function AgentIcon({ plan }: { plan: DashboardPlan }) {
  const label = agentLine(plan);
  const Icon = plan.agentConnected ? Bot : BotOff;
  return (
    <span className={`agent-icon${plan.agentConnected ? " on" : ""}`} role="img" aria-label={label} title={label}>
      <Icon aria-hidden="true" />
    </span>
  );
}

function PlanRow({ plan, offline, onDelete }: { plan: DashboardPlan; offline: boolean; onDelete: () => Promise<boolean> }) {
  const activity = planActivity(plan);
  const running = plan.status === "running";
  const ratio = Math.max(0, Math.min(100, Number(plan.completionRatio) || 0));
  const openUrl = running ? safeHttpUrl(plan.url) : "";
  const fileUrl =
    plan.storedPath && plan.id ? plan.fileUrl || `/archive/${encodeURIComponent(plan.id)}` : "";
  const asking = openQuestions(plan);
  const seen = agentSeenAgo(plan.agentSeenAt);
  const verdict = outcomeLabel(plan.outcome);
  const step = running && plan.executionActive ? plan.executionStep : null;
  // On the hosted app the step slot names the published version.
  const version = !plan.executionActive && plan.executionStep ? plan.executionStep : null;
  return (
    <tr data-activity={activity}>
      <td className="plan-cell">
        {openUrl ? (
          <a className="title title-link" href={openUrl}>
            {plan.title || "Untitled plan"}
          </a>
        ) : (
          <span className="title">{plan.title || "Untitled plan"}</span>
        )}
        <span className="plan-meta">
          <span className="plan-mode">{plan.mode || "watch"}</span>
          {version ? <span className="plan-meta-item">{version}</span> : null}
        </span>
        {plan.planPath ? <BrokenPath className="plan-file" value={plan.planPath} /> : null}
      </td>
      <td className="plan-status-cell">
        <span className="status-line">
          <span className="dash-pill" data-activity={activity}>
            <Glyph svg={ACTIVITY_GLYPH_SVG[activity]} />
            {statusLabel(plan)}
          </span>
          {running ? <AgentIcon plan={plan} /> : null}
        </span>
        {running && asking > 0 ? <span className="sub plan-ask">{questionsText(asking)}</span> : null}
        {step ? (
          <span className="sub">Step · {step}</span>
        ) : running && !plan.agentConnected && seen ? (
          <span className="sub">Agent last seen {seen}</span>
        ) : null}
        {!running && verdict ? <span className="sub">Review · {verdict}</span> : null}
      </td>
      <td className="plan-progress-cell">
        <span className="plan-progress" data-tone={progressTone(plan)}>
          <span className="plan-meter" aria-hidden="true">
            <span style={{ width: `${ratio}%` }} />
          </span>
          <span className="plan-percent">{ratio}%</span>
        </span>
        <span className="sub">{completionLabel(plan.completionState)}</span>
        <span className="sub">{progressDetail(plan)}</span>
      </td>
      <td className="plan-time-cell">
        <time className="plan-time" dateTime={plan.startedAt ? new Date(plan.startedAt).toISOString() : undefined}>
          {formatWhen(plan.startedAt)}
        </time>
        <span className="sub">{durationPhrase(plan.status, formatDuration(plan.durationMs))}</span>
      </td>
      <td className="plan-actions-cell">
        <PlanRowActions
          fileUrl={fileUrl}
          title={plan.title || "Untitled plan"}
          offline={offline}
          planId={plan.id}
          showVersions={Boolean(plan.id && plan.historyUrl)}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}
