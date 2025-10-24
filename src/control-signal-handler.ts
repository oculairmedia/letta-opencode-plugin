import type { ExecutionManager } from "./execution-manager.js";
import type { TaskRegistry } from "./task-registry.js";
import type { WorkspaceManager } from "./workspace-manager.js";
import type { MatrixRoomManager } from "./matrix-room-manager.js";

export type ControlSignalType = "cancel" | "pause" | "resume";

export interface ControlSignalRequest {
  taskId: string;
  signal: ControlSignalType;
  reason?: string;
  requestedBy: string;
}

export interface ControlSignalResult {
  success: boolean;
  taskId: string;
  signal: ControlSignalType;
  previousStatus?: string;
  newStatus?: string;
  error?: string;
}

export interface ControlSignalHandlerDependencies {
  execution: ExecutionManager;
  registry: TaskRegistry;
  workspace: WorkspaceManager;
  matrix?: MatrixRoomManager | null;
}

export class ControlSignalHandler {
  constructor(private deps: ControlSignalHandlerDependencies) {}

  async handleControlSignal(
    request: ControlSignalRequest
  ): Promise<ControlSignalResult> {
    const task = this.deps.registry.getTask(request.taskId);

    if (!task) {
      return {
        success: false,
        taskId: request.taskId,
        signal: request.signal,
        error: "Task not found in registry",
      };
    }

    const previousStatus = task.status;

    switch (request.signal) {
      case "cancel":
        return this.handleCancel(request, previousStatus);
      case "pause":
        return this.handlePause(request, previousStatus);
      case "resume":
        return this.handleResume(request, previousStatus);
      default:
        return {
          success: false,
          taskId: request.taskId,
          signal: request.signal,
          error: `Unknown control signal: ${request.signal}`,
        };
    }
  }

  private async handleCancel(
    request: ControlSignalRequest,
    previousStatus: string
  ): Promise<ControlSignalResult> {
    if (previousStatus === "completed" || previousStatus === "failed" || previousStatus === "cancelled") {
      return {
        success: false,
        taskId: request.taskId,
        signal: "cancel",
        previousStatus,
        error: `Cannot cancel task with status: ${previousStatus}`,
      };
    }

    const killed = await this.deps.execution.cancelTask(request.taskId);

    if (!killed && this.deps.execution.isTaskActive(request.taskId)) {
      return {
        success: false,
        taskId: request.taskId,
        signal: "cancel",
        previousStatus,
        error: "Failed to cancel task execution",
      };
    }

    this.deps.registry.updateStatus(request.taskId, "cancelled");

    await this.updateWorkspace(request.taskId, "cancelled", {
      type: "task_cancelled",
      message: request.reason || "Task cancelled by control signal",
      data: { requested_by: request.requestedBy },
    });

    await this.notifyMatrix(request.taskId, "Task cancelled", "status_change");

    return {
      success: true,
      taskId: request.taskId,
      signal: "cancel",
      previousStatus,
      newStatus: "cancelled",
    };
  }

  private async handlePause(
    request: ControlSignalRequest,
    previousStatus: string
  ): Promise<ControlSignalResult> {
    if (previousStatus !== "running") {
      return {
        success: false,
        taskId: request.taskId,
        signal: "pause",
        previousStatus,
        error: `Cannot pause task with status: ${previousStatus}`,
      };
    }

    const paused = await this.deps.execution.pauseTask(request.taskId);

    if (!paused) {
      return {
        success: false,
        taskId: request.taskId,
        signal: "pause",
        previousStatus,
        error: "Failed to pause task execution",
      };
    }

    this.deps.registry.updateStatus(request.taskId, "paused");

    await this.updateWorkspace(request.taskId, "paused", {
      type: "task_paused",
      message: request.reason || "Task paused by control signal",
      data: { requested_by: request.requestedBy },
    });

    await this.notifyMatrix(request.taskId, "Task paused", "status_change");

    return {
      success: true,
      taskId: request.taskId,
      signal: "pause",
      previousStatus,
      newStatus: "paused",
    };
  }

  private async handleResume(
    request: ControlSignalRequest,
    previousStatus: string
  ): Promise<ControlSignalResult> {
    if (previousStatus !== "paused") {
      return {
        success: false,
        taskId: request.taskId,
        signal: "resume",
        previousStatus,
        error: `Cannot resume task with status: ${previousStatus}`,
      };
    }

    const resumed = await this.deps.execution.resumeTask(request.taskId);

    if (!resumed) {
      return {
        success: false,
        taskId: request.taskId,
        signal: "resume",
        previousStatus,
        error: "Failed to resume task execution",
      };
    }

    this.deps.registry.updateStatus(request.taskId, "running");

    await this.updateWorkspace(request.taskId, "running", {
      type: "task_resumed",
      message: request.reason || "Task resumed by control signal",
      data: { requested_by: request.requestedBy },
    });

    await this.notifyMatrix(request.taskId, "Task resumed", "status_change");

    return {
      success: true,
      taskId: request.taskId,
      signal: "resume",
      previousStatus,
      newStatus: "running",
    };
  }

  private async updateWorkspace(
    taskId: string,
    status: "paused" | "cancelled" | "running",
    event: { type: string; message: string; data?: Record<string, unknown> }
  ): Promise<void> {
    const task = this.deps.registry.getTask(taskId);
    if (!task?.workspaceBlockId) {
      return;
    }

    try {
      await this.deps.workspace.updateWorkspace(task.agentId, task.workspaceBlockId, {
        status,
        events: [
          {
            timestamp: Date.now(),
            type: event.type as any,
            message: event.message,
            data: event.data,
          },
        ],
      });
    } catch (error) {
      console.error(`Failed to update workspace for task ${taskId}:`, error);
    }
  }

  private async notifyMatrix(
    taskId: string,
    message: string,
    eventType: "progress" | "error" | "status_change"
  ): Promise<void> {
    if (!this.deps.matrix) {
      return;
    }

    const task = this.deps.registry.getTask(taskId);
    if (!task?.matrixRoom) {
      return;
    }

    try {
      await this.deps.matrix.sendTaskUpdate(
        task.matrixRoom.roomId,
        taskId,
        message,
        eventType
      );
    } catch (error) {
      console.error(`Failed to send Matrix notification for task ${taskId}:`, error);
    }
  }
}
