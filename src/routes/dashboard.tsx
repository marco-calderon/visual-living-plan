import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { planActivity, type DashboardPeriod, type DashboardSummary } from "../dashboard.ts";
import {
  agentLine,
  completionLabel,
  DASHBOARD_FILTERS,
  dashboardStatusLine,
  emptyPlansText,
  formatDuration,
  formatWhen,
  safeHttpUrl,
  statusLabel,
  visiblePlans,
  type DashboardFilter,
} from "../dashboardFormat.ts";
import { Button } from "../../client/ui/button.tsx";
import { HostBar } from "../HostBar.tsx";
import { loadAccount, type AccountPayload } from "../planFns.ts";
import type { PlanRecord } from "../processRecord.ts";
import { PlanRowActions } from "./PlanRowActions.tsx";
import { DashboardSearch } from "./DashboardSearch.tsx";
import { dashboardLoadingCss, ROW_SKELETON_WIDTHS, STAT_SKELETONS } from "../dashboardLoading.ts";
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
      : error || (payload ? dashboardStatusLine(payload.summary, shown.length, filter) : "Loading plans…");

  return (
    <>
      <HostBar title="Dashboard" label={account.user.name || account.user.email} />
      <style dangerouslySetInnerHTML={{ __html: dashboardLoadingCss() }} />
      <main className="dashboard">
        <div className="dashboard-live" data-shift={switching ? "quiet" : shift}>
          <section className="dash-section" aria-label="Summary">
            <div className="section-bar">
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
              className={switching ? "stats dash-pending" : "stats"}
              aria-live="polite"
              aria-busy={loading || switching || undefined}
            >
              {loading ? (
                <StatSkeletons />
              ) : payload ? (
                <>
                  <Stat label="Active" value={String(payload.summary.active ?? 0)} />
                  <Stat label="Idle" value={String(payload.summary.idle ?? payload.summary.running)} />
                  <Stat label="Executed" value={String(payload.summary.executed)} />
                  <Stat label="Interrupted" value={String(payload.summary.interrupted)} />
                  <Stat label="Files modified" value={String(payload.summary.filesModified)} />
                  <Stat label="Execution time" value={formatDuration(payload.summary.durationMs)} />
                  <Stat label="Folders" value={String(payload.summary.folders)} />
                </>
              ) : null}
            </section>
            <p className="lede">{LEDE}</p>
            <div className="dash-status-row">
              <p className="status">{status}</p>
              {loading || switching ? <span className="dash-spinner" aria-hidden="true" /> : null}
            </div>
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
                <caption>Plans</caption>
                {/* Keyed by filter so each filter in a quick run fades its own rows in. */}
                <thead key={`head-${filter}`}>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Status</th>
                    <th scope="col">Completion</th>
                    <th scope="col">Started</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody key={`body-${filter}`}>
                  {loading ? (
                    <RowSkeletons />
                  ) : !payload ? (
                    <tr>
                      <td className="empty" colSpan={5}>
                        Could not read the dashboard.
                        <Button type="button" variant="secondary" className="dash-retry" onClick={() => void refresh()}>
                          Try again
                        </Button>
                      </td>
                    </tr>
                  ) : shown.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={5}>
                        {emptyPlansText(filter, period)}
                      </td>
                    </tr>
                  ) : (
                    shown.map((plan) => (
                      <PlanRow key={plan.id} plan={plan} offline={offline} onDelete={() => deletePlan(plan)} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
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

/** Placeholder cards while the first numbers load. The status line says what is loading. */
function StatSkeletons() {
  return (
    <>
      {Array.from({ length: STAT_SKELETONS }, (_, index) => (
        <article className="stat stat-skeleton" aria-hidden="true" key={index}>
          <span className="dash-skeleton" />
          <span className="dash-skeleton" />
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
          <td>
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
          <td>
            <span className="dash-skeleton skel-sub" style={{ width: width.when }} />
          </td>
          <td />
        </tr>
      ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
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
  const bits = [plan.mode || "watch"];
  if (plan.executionStep) bits.push(plan.executionStep);
  if (plan.outcome) bits.push(plan.outcome);
  const ratio = Math.max(0, Math.min(100, Number(plan.completionRatio) || 0));
  const openUrl = plan.status === "running" ? safeHttpUrl(plan.url) : "";
  const fileUrl =
    plan.storedPath && plan.id ? plan.fileUrl || `/archive/${encodeURIComponent(plan.id)}` : "";
  return (
    <tr>
      <td>
        {openUrl ? (
          <a className="title title-link" href={openUrl}>
            {plan.title || "Untitled plan"}
          </a>
        ) : (
          <span className="title">{plan.title || "Untitled plan"}</span>
        )}
        <span className="sub">{bits.join(", ")}</span>
        {plan.planPath ? <BrokenPath className="sub path" value={plan.planPath} /> : null}
      </td>
      <td>
        <span className="status-line">
          <span className={`pill ${planActivity(plan)}`}>{statusLabel(plan)}</span>
          {plan.status === "running" ? <AgentIcon plan={plan} /> : null}
        </span>
        {plan.status === "running" ? <span className="sub">{plan.pendingCount} pending</span> : null}
      </td>
      <td>
        <div className="meter">
          <span style={{ width: `${ratio}%` }} />
        </div>
        <span className="sub">
          {ratio}% {completionLabel(plan.completionState)}
        </span>
        <span className="sub">
          {plan.phaseDone}/{plan.phaseTotal} phases, {plan.interactionDone}/{plan.interactionTotal}{" "}
          answers
        </span>
      </td>
      <td className="num">{formatWhen(plan.startedAt)}</td>
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
