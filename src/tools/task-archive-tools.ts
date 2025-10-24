import { z } from "zod";
import type { TaskRegistry } from "../task-registry.js";
import type { WorkspaceManager } from "../workspace-manager.js";
import type { MatrixRoomManager } from "../matrix-room-manager.js";

export const GetTaskHistorySchema = z.object({
  task_id: z.string(),
  include_artifacts: z.boolean().default(false),
});

export type GetTaskHistoryParams = z.infer<typeof GetTaskHistorySchema>;

export const ArchiveTaskConversationSchema = z.object({
  task_id: z.string(),
  summary: z.string().optional(),
});

export type ArchiveTaskConversationParams = z.infer<typeof ArchiveTaskConversationSchema>;

export interface TaskArchiveDependencies {
  registry: TaskRegistry;
  workspace: WorkspaceManager;
  matrix?: MatrixRoomManager | null;
}

export async function getTaskHistory(
  params: GetTaskHistoryParams,
  deps: TaskArchiveDependencies
): Promise<{
  task_id: string;
  status: string;
  created_at: number;
  completed_at?: number;
  events: Array<{ timestamp: number; type: string; message: string }>;
  artifacts?: Array<{ timestamp: number; type: string; name: string; content: string }>;
}> {
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.workspaceBlockId) {
    throw new Error(`Task ${params.task_id} does not have a workspace block`);
  }

  const workspaceBlock = await deps.workspace.getWorkspace(
    task.agentId,
    task.workspaceBlockId
  );

  const history: {
    task_id: string;
    status: string;
    created_at: number;
    completed_at?: number;
    events: Array<{ timestamp: number; type: string; message: string }>;
    artifacts?: Array<{ timestamp: number; type: string; name: string; content: string }>;
  } = {
    task_id: params.task_id,
    status: task.status,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    events: workspaceBlock.events.map((e) => ({
      timestamp: e.timestamp,
      type: e.type,
      message: e.message,
    })),
  };

  if (params.include_artifacts) {
    history.artifacts = workspaceBlock.artifacts.map((a) => ({
      timestamp: a.timestamp,
      type: a.type,
      name: a.name,
      content: a.content,
    }));
  }

  return history;
}

export async function archiveTaskConversation(
  params: ArchiveTaskConversationParams,
  deps: TaskArchiveDependencies
): Promise<{
  task_id: string;
  archived_at: number;
  archive_location: string;
  message_count: number;
}> {
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.matrixRoom) {
    throw new Error(`Task ${params.task_id} does not have a communication channel to archive`);
  }

  if (task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled") {
    throw new Error(`Cannot archive task with status: ${task.status}. Task must be completed, failed, or cancelled.`);
  }

  const archiveInfo = await deps.matrix?.archiveTaskRoom(
    task.matrixRoom.roomId,
    task.taskId
  );

  if (!archiveInfo) {
    throw new Error("Failed to archive task conversation");
  }

  const history = await getTaskHistory(
    { task_id: params.task_id, include_artifacts: true },
    deps
  );

  if (task.workspaceBlockId) {
    await deps.workspace.appendEvent(task.agentId, task.workspaceBlockId, {
      timestamp: Date.now(),
      type: "task_message",
      message: params.summary || "Task conversation archived",
      data: {
        archived_at: archiveInfo.archivedAt,
        message_count: history.events.length,
        artifact_count: history.artifacts?.length || 0,
      },
    });
  }

  return {
    task_id: params.task_id,
    archived_at: archiveInfo.archivedAt,
    archive_location: task.workspaceBlockId || "unknown",
    message_count: history.events.length,
  };
}
