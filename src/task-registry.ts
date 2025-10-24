import type { TaskRegistryEntry, TaskQueueConfig } from "./types/task.js";
import type { RoomInfo } from "./types/matrix.js";

export class TaskRegistry {
  private tasks: Map<string, TaskRegistryEntry> = new Map();
  private idempotencyKeys: Map<string, string> = new Map();
  private config: TaskQueueConfig;

  constructor(config: TaskQueueConfig) {
    this.config = config;
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanup();
    }, 3600000);
  }

  private cleanup(): void {
    const now = Date.now();
    const expiry = now - this.config.idempotencyWindowMs;

    for (const [taskId, entry] of this.tasks.entries()) {
      if (
        entry.completedAt &&
        entry.completedAt < expiry &&
        entry.status !== "running"
      ) {
        this.tasks.delete(taskId);
        if (entry.idempotencyKey) {
          this.idempotencyKeys.delete(entry.idempotencyKey);
        }
      }
    }
  }

  register(
    taskId: string,
    agentId: string,
    idempotencyKey?: string
  ): TaskRegistryEntry {
    if (idempotencyKey && this.idempotencyKeys.has(idempotencyKey)) {
      const existingTaskId = this.idempotencyKeys.get(idempotencyKey)!;
      const existingTask = this.tasks.get(existingTaskId);
      if (existingTask) {
        return existingTask;
      }
    }

    const entry: TaskRegistryEntry = {
      taskId,
      agentId,
      idempotencyKey,
      status: "queued",
      createdAt: Date.now(),
    };

    this.tasks.set(taskId, entry);
    if (idempotencyKey) {
      this.idempotencyKeys.set(idempotencyKey, taskId);
    }

    return entry;
  }

  updateStatus(
    taskId: string,
    status: TaskRegistryEntry["status"],
    options?: {
      workspaceBlockId?: string;
    }
  ): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (status === "running" && !task.startedAt) {
        task.startedAt = Date.now();
      }
      if (
        (status === "completed" || status === "failed" || status === "timeout") &&
        !task.completedAt
      ) {
        task.completedAt = Date.now();
      }
      if (options?.workspaceBlockId) {
        task.workspaceBlockId = options.workspaceBlockId;
      }
    }
  }

  getTask(taskId: string): TaskRegistryEntry | undefined {
    return this.tasks.get(taskId);
  }

  getRunningTasksCount(): number {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "running"
    ).length;
  }

  canAcceptTask(): boolean {
    return this.getRunningTasksCount() < this.config.maxConcurrentTasks;
  }

  getAllTasks(): TaskRegistryEntry[] {
    return Array.from(this.tasks.values());
  }

  findTasksByAgent(agentId: string): TaskRegistryEntry[] {
    return Array.from(this.tasks.values()).filter((task) => task.agentId === agentId);
  }

  findTaskByMatrixRoom(roomId: string): TaskRegistryEntry | undefined {
    return Array.from(this.tasks.values()).find((task) => task.matrixRoom?.roomId === roomId);
  }

  updateMatrixRoom(taskId: string, roomInfo: RoomInfo): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.matrixRoom = roomInfo;
    }
  }

  clearMatrixRoom(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.matrixRoom = undefined;
    }
  }
}
