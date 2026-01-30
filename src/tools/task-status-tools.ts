import { z } from 'zod';
import type { TaskRegistry } from '../task-registry.js';
import type { WorkspaceManager } from '../workspace-manager.js';

export const GetTaskStatusSchema = z.object({
  task_id: z.string(),
});

export type GetTaskStatusParams = z.infer<typeof GetTaskStatusSchema>;

export interface TaskStatusDependencies {
  registry: TaskRegistry;
  workspace: WorkspaceManager;
}

export async function getTaskStatus(
  params: GetTaskStatusParams,
  deps: TaskStatusDependencies
): Promise<{
  task_id: string;
  status: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  agent_id: string;
  workspace_block_id?: string;
  recent_events: Array<{ timestamp: number; type: string; message: string }>;
  output?: string;
  error?: string;
  duration_ms?: number;
  exit_code?: number;
}> {
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  let recentEvents: Array<{ timestamp: number; type: string; message: string }> = [];

  if (task.workspaceBlockId) {
    try {
      const workspace = await deps.workspace.getWorkspace(task.agentId, task.workspaceBlockId);
      recentEvents = workspace.events.slice(-5).map((e) => ({
        timestamp: e.timestamp,
        type: e.type,
        message: e.message,
      }));
    } catch {
      // Workspace not yet available or error reading
    }
  }

  return {
    task_id: task.taskId,
    status: task.status,
    created_at: task.createdAt,
    started_at: task.startedAt,
    completed_at: task.completedAt,
    agent_id: task.agentId,
    workspace_block_id: task.workspaceBlockId,
    recent_events: recentEvents,
    output: task.output,
    error: task.error,
    duration_ms: task.durationMs,
    exit_code: task.exitCode,
  };
}
