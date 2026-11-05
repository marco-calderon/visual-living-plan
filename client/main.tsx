import { useQuery } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "../src/registerServiceWorker.ts";
import { startOfflineEngine } from "./offline/engine.ts";
import { useEffect, useMemo, useState } from "react";
import { ExecutionCanvas } from "./ExecutionCanvas";
import type { ExecutionState } from "../src/execution.ts";
import { createIdleExecutionState, mergePlannedExecution } from "../src/execution.ts";
import { subscribePlanEvents } from "./planEvents.ts";
import { startPlanStatusMark } from "./planStatusMark.ts";
import { sampleLoopExecution } from "./sampleLoopExecution.ts";
import { QueryProvider, sharedQueryClient } from "./queryClient.tsx";
import { viewingPlanVersion } from "./versionView.ts";
import "./execution.css";

type FocusWindow = Window & {
  livingPlanFocusPlanRef?: (planRef: string) => void;
};

type PlanWindow = Window & {
  __LIVE_PLAN_BASE__?: string;
};

function apiPath(path: string): string {
  const base = (window as PlanWindow).__LIVE_PLAN_BASE__ ?? "";
  return `${base}${path}`;
}

function readBootstrap(): ExecutionState {
  const node = document.getElementById("living-plan-bootstrap");
  if (!node?.textContent) return createIdleExecutionState();
  try {
    return JSON.parse(node.textContent) as ExecutionState;
  } catch {
    return createIdleExecutionState();
  }
}

async function readExecution(): Promise<ExecutionState> {
  const response = await fetch(apiPath("/api/execution"));
  if (!response.ok) throw new Error("Request failed");
  return (await response.json()) as ExecutionState;
}

function ExecutionApp() {
  const [bootstrap] = useState<ExecutionState>(readBootstrap);
  // The page's embedded state shows first. The event stream keeps it current, so there is no polling.
  const query = useQuery({
    queryKey: ["execution", apiPath("")],
    queryFn: readExecution,
    initialData: bootstrap,
    initialDataUpdatedAt: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const execution = query.data;
  const plannedGraph = useMemo(
    () => mergePlannedExecution(execution.planned, execution.graph),
    [execution.graph, execution.planned],
  );
  const showingSample = !plannedGraph && !execution.scene;
  const display = useMemo<ExecutionState>(
    () => (showingSample ? sampleLoopExecution : { ...execution, graph: plannedGraph }),
    [execution, plannedGraph, showingSample],
  );

  useEffect(() => {
    // A saved version shows the workflow from its own source, not the live run.
    if (viewingPlanVersion() !== null) return;
    const client = sharedQueryClient();
    const key = ["execution", apiPath("")];
    // initialDataUpdatedAt 0 marks the embedded state stale, so this reads the server once.
    void client.refetchQueries({ queryKey: key, exact: true });

    const stopExecution = subscribePlanEvents("execution", (event) => {
      try {
        client.setQueryData(key, JSON.parse(event.data) as ExecutionState);
      } catch {
        // ignore malformed events
      }
    });
    // Sent each time the stream opens. A page that was disconnected gets the run it missed at once,
    // then the full view with the plan's workflow, which a hosted hello leaves out.
    const stopHello = subscribePlanEvents("hello", (event) => {
      try {
        const execution = (JSON.parse(event.data) as { execution?: ExecutionState } | null)
          ?.execution;
        if (execution && typeof execution === "object") {
          client.setQueryData<ExecutionState>(key, (current) => ({
            ...execution,
            planned: execution.planned ?? current?.planned,
          }));
        }
      } catch {
        // ignore malformed events
      }
      void client.refetchQueries({ queryKey: key, exact: true });
    });
    const stopReload = subscribePlanEvents("reload", () => {
      void client.invalidateQueries({ queryKey: key, exact: true });
    });

    return () => {
      stopExecution();
      stopHello();
      stopReload();
    };
  }, []);

  function handleSelectPlanRef(planRef: string) {
    const focus = (window as FocusWindow).livingPlanFocusPlanRef;
    focus?.(planRef);
  }

  return (
    <div className="execution-shell">
      <div className="execution-stage">
        <ExecutionCanvas execution={display} onSelectPlanRef={handleSelectPlanRef} />
      </div>
    </div>
  );
}

if (typeof document !== "undefined") {
  registerServiceWorker();
  void startOfflineEngine();
  startPlanStatusMark();
  const root = document.getElementById("execution-root");
  if (root)
    createRoot(root).render(
      <QueryProvider>
        <ExecutionApp />
      </QueryProvider>,
    );
}
