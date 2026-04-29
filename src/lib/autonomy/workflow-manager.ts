import "server-only";

import { getRun, start } from "workflow/api";
import { info } from "@/lib/observability/telemetry";
import { updateAutonomyState } from "@/lib/persistence/autonomy-state";
import { autonomyTradingWorkflow } from "@/workflows/autonomy-trading";

type AutonomyWorkflowTrigger =
  | "manual_start"
  | "status_poll"
  | "scheduler"
  | "manual";

function makeWorkflowSessionId() {
  return `autonomy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isTerminalWorkflowStatus(status: string) {
  return ["completed", "failed", "cancelled", "canceled"].includes(
    status.toLowerCase(),
  );
}

export async function ensureAutonomyWorkflowRun(
  trigger: AutonomyWorkflowTrigger = "scheduler",
) {
  const preparedState = await updateAutonomyState((state) => {
    if (!state.running) {
      return state;
    }

    return {
      ...state,
      workflowSessionId: state.workflowSessionId ?? makeWorkflowSessionId(),
      nextRunAt: state.nextRunAt ?? new Date().toISOString(),
    };
  });

  if (!preparedState.running || !preparedState.workflowSessionId) {
    return null;
  }

  if (preparedState.workflowRunId) {
    const existingRun = getRun(preparedState.workflowRunId);
    if (await existingRun.exists) {
      const status = String(await existingRun.status);
      if (!isTerminalWorkflowStatus(status)) {
        return {
          runId: preparedState.workflowRunId,
          status,
          started: false,
        };
      }
    }
  }

  const run = await start(autonomyTradingWorkflow, [
    preparedState.workflowSessionId,
    trigger,
  ]);

  await updateAutonomyState((state) => {
    if (state.workflowSessionId !== preparedState.workflowSessionId) {
      return state;
    }

    return {
      ...state,
      workflowRunId: run.runId,
    };
  });

  info("autonomy.workflow", "Autonomy workflow enqueued", {
    runId: run.runId,
    sessionId: preparedState.workflowSessionId,
    trigger,
  });

  return {
    runId: run.runId,
    status: "queued",
    started: true,
  };
}
