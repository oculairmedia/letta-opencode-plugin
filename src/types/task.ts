import type { RoomInfo } from './matrix.js';

export interface TaskRegistryEntry {
  taskId: string;
  agentId: string;
  idempotencyKey?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'paused' | 'cancelled';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  workspaceBlockId?: string;
  matrixRoom?: RoomInfo;
}

export interface TaskQueueConfig {
  maxConcurrentTasks: number;
  idempotencyWindowMs: number;
}
