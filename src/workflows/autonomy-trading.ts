import { sleep } from "workflow";
import { dispatchAutonomyWorker } from "@/lib/autonomy/service";
import { info, warn } from "@/lib/observability/telemetry";
import {
  readAutonomyState,
  updateAutonomyState,
} from "@/lib/persistence/autonomy-state";

type AutonomyWorkflowTrigger =
  | "manual_start"
  | "status_poll"
  | "scheduler"
  | "manual";

function isCurrentSession(
  sessionId: string,
  state: Awaited<ReturnType<typeof readAutonomyState>>,
) {
  return state.running && state.workflowSessionId === sessionId;
}

export async function autonomyTradingWorkflow(
  sessionId: string,
  initialTrigger: AutonomyWorkflowTrigger = "scheduler",
) {
  "use workflow";

  await logWorkflowLifecycle("started", sessionId, initialTrigger);

  let trigger = initialTrigger;

  while (await shouldContinueAutonomyWorkflow(sessionId)) {
    await runAutonomyWorkerStep(sessionId, trigger);
    trigger = "scheduler";

    const nextWakeAt = await getNextAutonomyWakeAt(sessionId);
    if (!nextWakeAt) {
      break;
    }

    await sleep(nextWakeAt);
  }

  await finalizeAutonomyWorkflow(sessionId);
}

async function shouldContinueAutonomyWorkflow(
  sessionId: string,
): Promise<boolean> {
  "use step";

  const state = await readAutonomyState();
  return isCurrentSession(sessionId, state);
}

async function runAutonomyWorkerStep(
  sessionId: string,
  trigger: AutonomyWorkflowTrigger,
) {
  "use step";

  const state = await readAutonomyState();
  if (!isCurrentSession(sessionId, state)) {
    return;
  }

  await dispatchAutonomyWorker({ trigger });
}

async function getNextAutonomyWakeAt(sessionId: string): Promise<Date | null> {
  "use step";

  const state = await readAutonomyState();
  if (!isCurrentSession(sessionId, state)) {
    return null;
  }

  if (state.nextRunAt) {
    const nextWakeAt = new Date(state.nextRunAt);
    if (Number.isFinite(nextWakeAt.getTime())) {
      return nextWakeAt;
    }
  }

  return new Date(Date.now() + Math.max(1_000, state.intervalMs));
}

async function finalizeAutonomyWorkflow(sessionId: string) {
  "use step";

  const nextState = await updateAutonomyState((state) => {
    if (state.workflowSessionId !== sessionId) {
      return state;
    }

    return {
      ...state,
      workflowRunId: undefined,
      workflowSessionId: state.running ? state.workflowSessionId : undefined,
      inFlight: false,
      leaseId: undefined,
      leaseAcquiredAt: undefined,
    };
  });

  const eventType =
    nextState.workflowSessionId !== undefined &&
    nextState.workflowSessionId !== sessionId
      ? "superseded"
      : "stopped";
  await logWorkflowLifecycle(eventType, sessionId);
}

async function logWorkflowLifecycle(
  eventType: "started" | "stopped" | "superseded",
  sessionId: string,
  trigger?: AutonomyWorkflowTrigger,
) {
  "use step";

  const payload = {
    sessionId,
    trigger,
  };

  if (eventType === "started") {
    info("autonomy.workflow", "Autonomy workflow started", payload);
    return;
  }

  warn(
    "autonomy.workflow",
    eventType === "superseded"
      ? "Autonomy workflow exited because a newer session took over"
      : "Autonomy workflow stopped",
    payload,
  );
}
