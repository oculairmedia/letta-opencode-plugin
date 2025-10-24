import { z } from "zod";
import { LettaClient } from "../letta-client.js";
import { WorkspaceManager } from "../workspace-manager.js";
import { ExecutionManager } from "../execution-manager.js";
import { TaskRegistry } from "../task-registry.js";
import type { ExecutionRequest } from "../types/execution.js";

export const ExecuteTaskSchema = z.object({
  agent_id: z.string().describe("ID of the Letta agent requesting the task"),
  task_description: z
    .string()
    .describe("Natural language description of the task to execute"),
  idempotency_key: z
    .string()
    .optional()
    .describe("Optional key to prevent duplicate execution"),
  timeout_ms: z
    .number()
    .optional()
    .describe("Optional task execution timeout in milliseconds"),
  sync: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, wait for task completion; if false, return immediately"),
  observers: z
    .array(z.string())
    .optional()
    .describe("Optional list of Matrix user IDs to invite as observers (e.g., @user:domain.com)"),
});

export type ExecuteTaskParams = z.infer<typeof ExecuteTaskSchema>;

import type { MatrixRoomManager } from "../matrix-room-manager.js";

export interface ExecuteTaskDependencies {
  letta: LettaClient;
  workspace: WorkspaceManager;
  execution: ExecutionManager;
  registry: TaskRegistry;
  matrix?: MatrixRoomManager | null;
}

export async function executeTask(
  params: ExecuteTaskParams,
  deps: ExecuteTaskDependencies
): Promise<Record<string, unknown>> {
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  if (!deps.registry.canAcceptTask()) {
    return {
      error: "Task queue full",
      code: "QUEUE_FULL",
      status: 429,
    };
  }

  const existingTask = deps.registry.register(
    taskId,
    params.agent_id,
    params.idempotency_key
  );

  if (existingTask.taskId !== taskId) {
    return {
      task_id: existingTask.taskId,
      status: existingTask.status,
      message: "Task already exists (idempotency key match)",
      workspace_block_id: existingTask.workspaceBlockId,
    };
  }

  const { blockId, workspace } = await deps.workspace.createWorkspaceBlock({
    task_id: taskId,
    agent_id: params.agent_id,
    metadata: {
      task_description: params.task_description,
      idempotency_key: params.idempotency_key,
    },
  });

  deps.registry.updateStatus(taskId, "queued", { workspaceBlockId: blockId });

  if (!params.sync) {
    executeTaskAsync(
      taskId,
      params,
      blockId,
      deps
    ).catch((error) => {
      console.error(`Task ${taskId} failed:`, error);
    });

    return {
      task_id: taskId,
      status: "queued",
      workspace_block_id: blockId,
      message: "Task queued for execution",
    };
  }

  try {
    const result = await executeTaskAsync(taskId, params, blockId, deps);
    return result;
  } catch (error) {
    return {
      task_id: taskId,
      status: "failed",
      workspace_block_id: blockId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeTaskAsync(
  taskId: string,
  params: ExecuteTaskParams,
  workspaceBlockId: string,
  deps: ExecuteTaskDependencies
): Promise<Record<string, unknown>> {
  try {
    deps.registry.updateStatus(taskId, "running");

    // Create Matrix room if Matrix is enabled
    let roomInfo: any = null;
    if (deps.matrix) {
      const defaultObservers = (process.env.MATRIX_DEFAULT_HUMAN_OBSERVERS || "")
        .split(",")
        .map((observer) => observer.trim())
        .filter((observer) => observer.length > 0);

      const allObservers = [
        ...defaultObservers,
        ...(params.observers || []),
      ].filter((observer) => observer.length > 0);

      try {
        roomInfo = await deps.matrix.createTaskRoom({
          taskId,
          taskDescription: params.task_description,
          callingAgentId: params.agent_id,
          humanObservers: allObservers.length > 0 ? allObservers : undefined,
          metadata: {
            idempotency_key: params.idempotency_key,
            timeout_ms: params.timeout_ms,
            sync: params.sync,
          },
        });
        deps.registry.updateMatrixRoom(taskId, roomInfo);
      } catch (matrixError) {
        console.error(`Failed to create Matrix room for task ${taskId}:`, matrixError);
      }
    }

    await deps.workspace.updateWorkspace(params.agent_id, workspaceBlockId, {
      status: "running",
      events: [
        {
          timestamp: Date.now(),
          type: "task_started",
          message: "Task execution started",
          data: roomInfo ? { matrix_room_id: roomInfo.roomId } : undefined,
        },
      ],
    });

    const executionRequest: ExecutionRequest = {
      taskId,
      agentId: params.agent_id,
      prompt: params.task_description,
      workspaceBlockId,
      timeout: params.timeout_ms,
    };

    const result = await deps.execution.execute(executionRequest, (event) => {
      const workspaceEvent = {
        timestamp: event.timestamp,
        type: "task_progress" as const,
        message: `OpenCode event: ${event.type}`,
        data: { event_type: event.type, event_data: event.data },
      };

      deps.workspace
        .updateWorkspace(params.agent_id, workspaceBlockId, {
          events: [workspaceEvent],
        })
        .catch((error) => {
          console.error(
            `Failed to update workspace with event for task ${taskId}:`,
            error
          );
        });

      if (deps.matrix && roomInfo) {
        deps.matrix
          .sendTaskUpdate(
            roomInfo.roomId,
            taskId,
            `${event.type}: ${String(event.data)}`,
            "progress"
          )
          .catch((error) => {
            console.error(
              `Failed to send Matrix update for task ${taskId}:`,
              error
            );
          });
      }
    });

    const finalStatus =
      result.status === "success"
        ? "completed"
        : result.status === "timeout"
        ? "timeout"
        : "failed";

    deps.registry.updateStatus(taskId, finalStatus);

    // Close Matrix room if Matrix is enabled and room was created
    if (deps.matrix && roomInfo) {
      try {
        await deps.matrix.closeTaskRoom(
          roomInfo.roomId,
          taskId,
          `Task ${finalStatus} after ${result.durationMs}ms`
        );
        deps.registry.clearMatrixRoom(taskId);
      } catch (matrixError) {
        console.error(`Failed to close Matrix room for task ${taskId}:`, matrixError);
      }
    }

    await deps.workspace.updateWorkspace(params.agent_id, workspaceBlockId, {
      status: finalStatus,
      events: [
        {
          timestamp: Date.now(),
          type:
            result.status === "success"
              ? "task_completed"
              : result.status === "timeout"
              ? "task_timeout"
              : "task_failed",
          message: result.error || "Task execution completed",
          data: {
            exit_code: result.exitCode,
            duration_ms: result.durationMs,
            matrix_room_id: roomInfo?.roomId,
          },
        },
      ],
      artifacts: [
        {
          timestamp: Date.now(),
          type: result.status === "success" ? "output" : "error",
          name: result.status === "success" ? "execution_output" : "execution_error",
          content: result.output,
        },
      ],
    });

    await deps.workspace.detachWorkspaceBlock(params.agent_id, workspaceBlockId);

    return {
      task_id: taskId,
      status: finalStatus,
      workspace_block_id: workspaceBlockId,
      exit_code: result.exitCode,
      duration_ms: result.durationMs,
      output: result.output.slice(0, 5000),
    };
  } catch (error) {
    deps.registry.updateStatus(taskId, "failed");

    try {
      await deps.workspace.updateWorkspace(params.agent_id, workspaceBlockId, {
        status: "failed",
        events: [
          {
            timestamp: Date.now(),
            type: "task_failed",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    } catch (workspaceError) {
      console.error(`Failed to update workspace on error for task ${taskId}:`, workspaceError);
    }

    await deps.workspace.detachWorkspaceBlock(params.agent_id, workspaceBlockId);

    return {
      task_id: taskId,
      status: "failed",
      workspace_block_id: workspaceBlockId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
