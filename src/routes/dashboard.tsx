import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { planActivity, type DashboardPeriod, type DashboardSummary } from "../dashboard.ts";
import {
  agentLine,
  completionLabel,
  DASHBOARD_FILTERS,
  dashboardStatusLine,
  formatDuration,
  formatWhen,
  periodIndex,
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
import { startOfflineEngine } from "../../client/offline/engine.ts";
import { refreshDeviceDashboards } from "../../client/offline/warmPlans.ts";
import { dashboardAccountDecision, isAccountNetworkFailure } from "../offlineSync.ts";
import "./dashboard.css";
import { RefreshCcw } from "lucide-react";

const LEDE =
  "Hosted plans for this account. Summaries follow the local day, week, and month. Each published version is stored on this host, and the latest 10 are kept. Loopback plans stay on your machine.";

const PERIODS: Array<{ id: DashboardPeriod; label: string; aria?: string }> = [
  { id: "day", label: "Today" },
  { id: "week", label: "Week", aria: "This week" },
  { id: "month", label: "Month", aria: "This month" },
];

const FILTERS = DASHBOARD_FILTERS;

type DashboardSearch = { period?: DashboardPeriod };

type DashboardPlan = PlanRecord & { fileUrl?: string; historyUrl?: string };

type DashboardBody = {
  summary: DashboardSummary;
  plans: DashboardPlan[];
};

type Shift = "enter" | "forward" | "back" | "filter" | "quiet";

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
  const [shift, setShift] = useState<Shift>("enter");
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

  useEffect(() => {
    if (!payload || shift === "quiet") return;
    const timer = window.setTimeout(() => setShift("quiet"), 240);
    return () => window.clearTimeout(timer);
  }, [payload, shift]);

  function choosePeriod(next: DashboardPeriod) {
    if (next === period) return;
    setShift(periodIndex(next) > periodIndex(period) ? "forward" : "back");
    void navigate({ to: "/dashboard", search: { period: next }, replace: true });
  }

  function chooseFilter(next: DashboardFilter) {
    if (next === filter) return;
    setShift("filter");
    setFilter(next);
  }

  const plans = payload?.plans ?? [];
  const shown = visiblePlans(plans, filter);
  const offline = !online || offlineAt !== null;
  const status = offlineAt
    ? `Offline · updated ${formatWhen(offlineAt)}`
    : error || (payload ? dashboardStatusLine(payload.summary, shown.length, filter) : "Loading…");

  return (
    <>
      <HostBar title="Dashboard" label={account.user.name || account.user.email} />
      <main className="dashboard">
        <div className="dashboard-live" data-shift={shift}>
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
                onClick={() => {
                  setShift("filter");
                  void dashboard.refetch();
                }}
              >
                <RefreshCcw />
                Refresh
              </Button>
            </div>
            <section className="stats" aria-live="polite">
              {payload ? (
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
            <p className="status">{status}</p>
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
            <div className="table-wrap">
              <table>
                <caption>Plans</caption>
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col">Status</th>
                    <th scope="col">Completion</th>
                    <th scope="col">Folder</th>
                    <th scope="col">Files</th>
                    <th scope="col">Started</th>
                    <th scope="col">Duration</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {payload && shown.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={8}>
                        No plans in this view.
                      </td>
                    </tr>
                  ) : (
                    shown.map((plan) => <PlanRow key={plan.id} plan={plan} offline={offline} />)
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

function PlanRow({ plan, offline }: { plan: DashboardPlan; offline: boolean }) {
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
        <span className="title">{plan.title || "Untitled plan"}</span>
        <span className="sub">{bits.join(", ")}</span>
        {plan.planPath ? <BrokenPath className="sub path" value={plan.planPath} /> : null}
      </td>
      <td>
        <span className={`pill ${planActivity(plan)}`}>{statusLabel(plan)}</span>
        {plan.status === "running" ? (
          <>
            <span className="sub">{agentLine(plan)}</span>
            <span className="sub">{plan.pendingCount} pending</span>
          </>
        ) : null}
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
      <td>
        {plan.directory ? <BrokenPath className="path" value={plan.directory} /> : null}
        {plan.git?.branch ? (
          <span className="sub">
            {plan.git.branch}, {plan.git.dirty ? "dirty" : "clean"}
          </span>
        ) : null}
      </td>
      <td className="num">{plan.filesModified ?? 0}</td>
      <td className="num">{formatWhen(plan.startedAt)}</td>
      <td className="num">{formatDuration(plan.durationMs)}</td>
      <td className="plan-actions-cell">
        <PlanRowActions
          openUrl={openUrl}
          fileUrl={fileUrl}
          offline={offline}
          planId={plan.id}
          showVersions={Boolean(plan.id && plan.historyUrl)}
        />
      </td>
    </tr>
  );
}
