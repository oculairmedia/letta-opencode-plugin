import { z } from 'zod';
import type { TaskRegistry } from '../task-registry.js';
import type { MatrixRoomManager } from '../matrix-room-manager.js';

export const AddTaskObserverSchema = z.object({
  task_id: z.string(),
  observer_id: z.string(),
  observer_type: z.enum(['human', 'agent']).default('human'),
  read_only: z.boolean().default(true),
});

export type AddTaskObserverParams = z.infer<typeof AddTaskObserverSchema>;

export const RemoveTaskObserverSchema = z.object({
  task_id: z.string(),
  observer_id: z.string(),
});

export type RemoveTaskObserverParams = z.infer<typeof RemoveTaskObserverSchema>;

export const ListTaskObserversSchema = z.object({
  task_id: z.string(),
});

export type ListTaskObserversParams = z.infer<typeof ListTaskObserversSchema>;

export interface TaskObserverDependencies {
  registry: TaskRegistry;
  matrix?: MatrixRoomManager | null;
}

function ensureMatrix(deps: TaskObserverDependencies): MatrixRoomManager {
  if (!deps.matrix) {
    throw new Error('Task coordination is not enabled for this deployment');
  }
  return deps.matrix;
}

export async function addTaskObserver(
  params: AddTaskObserverParams,
  deps: TaskObserverDependencies
): Promise<{ task_id: string; observer_id: string; channel_id: string }> {
  const matrix = ensureMatrix(deps);
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.matrixRoom) {
    throw new Error(`Task ${params.task_id} does not have an associated communication channel`);
  }

  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    throw new Error(`Cannot add observer to task with status: ${task.status}`);
  }

  if (!params.observer_id.startsWith('@')) {
    throw new Error('Observer ID must be a valid Matrix user ID (starting with @)');
  }

  await matrix.inviteToRoom(task.matrixRoom.roomId, params.observer_id, params.read_only);

  return {
    task_id: params.task_id,
    observer_id: params.observer_id,
    channel_id: task.matrixRoom.roomId,
  };
}

export async function removeTaskObserver(
  params: RemoveTaskObserverParams,
  deps: TaskObserverDependencies
): Promise<{ task_id: string; observer_id: string; channel_id: string }> {
  const matrix = ensureMatrix(deps);
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.matrixRoom) {
    throw new Error(`Task ${params.task_id} does not have an associated communication channel`);
  }

  await matrix.removeFromRoom(task.matrixRoom.roomId, params.observer_id);

  return {
    task_id: params.task_id,
    observer_id: params.observer_id,
    channel_id: task.matrixRoom.roomId,
  };
}

export async function listTaskObservers(
  params: ListTaskObserversParams,
  deps: TaskObserverDependencies
): Promise<{ task_id: string; observers: Array<{ id: string; type: string; role: string }> }> {
  ensureMatrix(deps);
  const task = deps.registry.getTask(params.task_id);

  if (!task) {
    throw new Error(`Task ${params.task_id} not found`);
  }

  if (!task.matrixRoom) {
    throw new Error(`Task ${params.task_id} does not have an associated communication channel`);
  }

  const observers = (task.matrixRoom.participants || [])
    .filter((p) => p.role === 'observer' || p.type === 'human')
    .map((p) => ({
      id: p.id,
      type: p.type,
      role: p.role,
    }));

  return {
    task_id: params.task_id,
    observers,
  };
}
