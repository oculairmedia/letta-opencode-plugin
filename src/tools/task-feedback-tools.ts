import { z } from 'zod';
import type { TaskRegistry } from '../task-registry.js';
import type { WorkspaceManager } from '../workspace-manager.js';
import type { MatrixRoomManager } from '../matrix-room-manager.js';

export const SendTaskFeedbackSchema = z.object({
  task_id: z.string(),
  feedback: z.string(),
  feedback_type: z
    .enum(['clarification', 'correction', 'guidance', 'approval'])
    .default('guidance'),
  metadata: z.record(z.unknown()).optional(),
});

export type SendTaskFeedbackParams = z.infer<typeof SendTaskFeedbackSchema>;

export const SendRuntimeUpdateSchema = z.object({
  task_id: z.string(),
  update: z.string(),
  update_type: z
    .enum(['context_change', 'requirement_change', 'priority_change'])
    .default('context_change'),
  metadata: z.record(z.unknown()).optional(),
});

export type SendRuntimeUpdateParams = z.infer<typeof SendRuntimeUpdateSchema>;

export interface TaskFeedbackDependencies {
  registry: TaskRegistry;
  workspace: WorkspaceManager;
  matrix?: MatrixRoomManager | null;
}

export async function sendTaskFeedback(
  params: SendTaskFeedbackParams,
  deps: TaskFeedbackDependencies
): Promise<{ task_id: string; feedback_id: string; timestamp: number }> {
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.workspaceBlockId) {
    throw new Error(`Task ${params.task_id} does not have a workspace block`);
  }

  if (task.status !== 'running' && task.status !== 'paused') {
    throw new Error(`Cannot send feedback to task with status: ${task.status}`);
  }

  const timestamp = Date.now();
  const feedbackId = `feedback-${timestamp}`;

  await deps.workspace.appendEvent(task.agentId, task.workspaceBlockId, {
    timestamp,
    type: 'task_feedback',
    message: params.feedback,
    data: {
      feedback_id: feedbackId,
      feedback_type: params.feedback_type,
      ...params.metadata,
    },
  });

  if (deps.matrix && task.matrixRoom) {
    await deps.matrix.sendTaskUpdate(
      task.matrixRoom.roomId,
      task.taskId,
      `Feedback [${params.feedback_type}]: ${params.feedback}`,
      'progress'
    );
  }

  return {
    task_id: params.task_id,
    feedback_id: feedbackId,
    timestamp,
  };
}

export async function sendRuntimeUpdate(
  params: SendRuntimeUpdateParams,
  deps: TaskFeedbackDependencies
): Promise<{ task_id: string; update_id: string; timestamp: number }> {
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.workspaceBlockId) {
    throw new Error(`Task ${params.task_id} does not have a workspace block`);
  }

  if (task.status !== 'running' && task.status !== 'paused') {
    throw new Error(`Cannot send runtime update to task with status: ${task.status}`);
  }

  const timestamp = Date.now();
  const updateId = `update-${timestamp}`;

  await deps.workspace.appendEvent(task.agentId, task.workspaceBlockId, {
    timestamp,
    type: 'task_runtime_update',
    message: params.update,
    data: {
      update_id: updateId,
      update_type: params.update_type,
      ...params.metadata,
    },
  });

  if (deps.matrix && task.matrixRoom) {
    await deps.matrix.sendTaskUpdate(
      task.matrixRoom.roomId,
      task.taskId,
      `Runtime Update [${params.update_type}]: ${params.update}`,
      'progress'
    );
  }

  return {
    task_id: params.task_id,
    update_id: updateId,
    timestamp,
  };
}
