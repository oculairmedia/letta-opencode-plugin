import { z } from "zod";
import type { TaskRegistry } from "../task-registry.js";
import type { WorkspaceManager } from "../workspace-manager.js";
import type { MatrixRoomManager } from "../matrix-room-manager.js";

export const SendTaskMessageSchema = z.object({
  task_id: z.string(),
  message: z.string(),
  message_type: z
    .enum([
      "update",
      "feedback",
      "context_change",
      "requirement_change",
      "priority_change",
      "clarification",
      "correction",
      "guidance",
      "approval",
    ])
    .default("update"),
  metadata: z.record(z.unknown()).optional(),
});

export type SendTaskMessageParams = z.infer<typeof SendTaskMessageSchema>;

export interface TaskMessageDependencies {
  registry: TaskRegistry;
  workspace: WorkspaceManager;
  matrix?: MatrixRoomManager | null;
}

const MESSAGE_TYPE_TO_WORKSPACE_EVENT: Record<string, string> = {
  update: "task_progress",
  feedback: "task_feedback",
  context_change: "task_runtime_update",
  requirement_change: "task_runtime_update",
  priority_change: "task_runtime_update",
  clarification: "task_feedback",
  correction: "task_feedback",
  guidance: "task_feedback",
  approval: "task_feedback",
};

const MESSAGE_TYPE_TO_MATRIX_EVENT: Record<string, "progress" | "error" | "status_change"> = {
  update: "progress",
  feedback: "progress",
  context_change: "progress",
  requirement_change: "progress",
  priority_change: "progress",
  clarification: "progress",
  correction: "progress",
  guidance: "progress",
  approval: "progress",
};

export async function sendTaskMessage(
  params: SendTaskMessageParams,
  deps: TaskMessageDependencies
): Promise<{ task_id: string; message_id: string; timestamp: number }> {
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.workspaceBlockId) {
    throw new Error(`Task ${params.task_id} does not have a workspace block`);
  }

  if (task.status !== "running" && task.status !== "paused") {
    throw new Error(`Cannot send message to task with status: ${task.status}`);
  }

  const timestamp = Date.now();
  const messageId = `msg-${timestamp}`;

  const workspaceEventType =
    MESSAGE_TYPE_TO_WORKSPACE_EVENT[params.message_type] || "task_message";

  await deps.workspace.appendEvent(task.agentId, task.workspaceBlockId, {
    timestamp,
    type: workspaceEventType as any,
    message: params.message,
    data: {
      message_id: messageId,
      message_type: params.message_type,
      ...params.metadata,
    },
  });

  if (deps.matrix && task.matrixRoom) {
    const matrixEventType =
      MESSAGE_TYPE_TO_MATRIX_EVENT[params.message_type] || "progress";

    await deps.matrix.sendTaskUpdate(
      task.matrixRoom.roomId,
      task.taskId,
      `[${params.message_type}] ${params.message}`,
      matrixEventType
    );
  }

  return {
    task_id: params.task_id,
    message_id: messageId,
    timestamp,
  };
}
