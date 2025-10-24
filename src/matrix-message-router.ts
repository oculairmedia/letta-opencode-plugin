import type { MatrixClientWrapper } from "./matrix-client.js";
import type { MatrixRoomManager } from "./matrix-room-manager.js";
import type { TaskRegistry } from "./task-registry.js";
import type { WorkspaceManager } from "./workspace-manager.js";
import type { WorkspaceEvent } from "./types/workspace.js";
import type { RoomInfo } from "./types/matrix.js";
import type { ControlSignalHandler } from "./control-signal-handler.js";

const DEBUG = process.env.DEBUG === "true";

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.error("[matrix-message-router]", ...args);
  }
}

export interface MatrixMessageRouterConfig {
  allowHumanObservers?: boolean;
}

interface MatrixEventContent {
  msgtype?: string;
  body?: string;
  format?: string;
  formatted_body?: string;
  [key: string]: unknown;
}

interface MatrixTimelineEvent {
  event_id: string;
  type: string;
  sender: string;
  origin_server_ts: number;
  content: MatrixEventContent;
}

interface MatrixRoomEvent extends MatrixTimelineEvent {
  room_id: string;
}

export class MatrixMessageRouter {
  private running = false;
  private readonly matrix: MatrixClientWrapper;
  private readonly rooms: MatrixRoomManager;
  private readonly registry: TaskRegistry;
  private readonly workspace: WorkspaceManager;
  private readonly config: MatrixMessageRouterConfig;
  private readonly controlHandler?: ControlSignalHandler;
  private listener?: (roomId: string, event: MatrixTimelineEvent) => void;

  constructor(options: {
    matrix: MatrixClientWrapper;
    rooms: MatrixRoomManager;
    registry: TaskRegistry;
    workspace: WorkspaceManager;
    controlHandler?: ControlSignalHandler;
    config?: MatrixMessageRouterConfig;
  }) {
    this.matrix = options.matrix;
    this.rooms = options.rooms;
    this.registry = options.registry;
    this.workspace = options.workspace;
    this.controlHandler = options.controlHandler;
    this.config = options.config || {};
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;

    this.listener = (roomId, event) => {
      void this.handleEvent({ ...event, room_id: roomId });
    };

    this.matrix.getClient().on("room.message", this.listener);
    log("Matrix message router started");
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    if (this.listener) {
      this.matrix.getClient().removeListener("room.message", this.listener);
      this.listener = undefined;
    }

    this.running = false;
    log("Matrix message router stopped");
  }

  private async handleEvent(event: MatrixRoomEvent): Promise<void> {
    try {
      const taskEntry = this.registry.findTaskByMatrixRoom(event.room_id);
      if (!taskEntry || !taskEntry.matrixRoom) {
        return;
      }

      const taskId = taskEntry.taskId;
      const workspaceBlockId = taskEntry.workspaceBlockId;

      if (!workspaceBlockId) {
        log(`Task ${taskId} has no workspace block; skipping event`);
        return;
      }

      if (event.content.msgtype === "io.letta.control" && this.controlHandler) {
        await this.handleControlSignal(event, taskId);
        return;
      }

      const metadata = this.extractTaskMetadata(event);

      const workspaceEvent: WorkspaceEvent = {
        timestamp: event.origin_server_ts,
        type: this.mapEventType(event),
        message: this.extractMessage(event),
        data: {
          matrix_event_id: event.event_id,
          matrix_room_id: event.room_id,
          sender: event.sender,
          msgtype: event.content.msgtype,
          ...metadata,
        },
      };

      await this.workspace.appendEvent(taskEntry.agentId, workspaceBlockId, workspaceEvent);
      log(`Recorded Matrix event ${event.event_id} for task ${taskId}`);
    } catch (error) {
      console.error("Failed to process Matrix event:", error);
    }
  }

  private async handleControlSignal(
    event: MatrixRoomEvent,
    taskId: string
  ): Promise<void> {
    if (!this.controlHandler) {
      log(`No control handler configured, ignoring control signal for task ${taskId}`);
      return;
    }

    const metadata = this.extractTaskMetadata(event);
    const controlSignal = metadata.control_signal as string | undefined;
    const reason = metadata.reason as string | undefined;

    if (!controlSignal || !["cancel", "pause", "resume"].includes(controlSignal)) {
      log(`Invalid control signal: ${controlSignal}`);
      return;
    }

    log(`Processing control signal ${controlSignal} for task ${taskId}`);

    const result = await this.controlHandler.handleControlSignal({
      taskId,
      signal: controlSignal as "cancel" | "pause" | "resume",
      reason,
      requestedBy: event.sender,
    });

    if (result.success) {
      log(
        `Control signal ${controlSignal} succeeded for task ${taskId}: ${result.previousStatus} -> ${result.newStatus}`
      );
    } else {
      log(`Control signal ${controlSignal} failed for task ${taskId}: ${result.error}`);
    }
  }

  private extractMessage(event: MatrixRoomEvent): string {
    const content = event.content;
    if (content.formatted_body && typeof content.formatted_body === "string") {
      return content.formatted_body;
    }
    if (content.body && typeof content.body === "string") {
      return content.body;
    }
    return "";
  }

  private extractTaskMetadata(event: MatrixRoomEvent): Record<string, unknown> {
    const taskMetadata = event.content["io.letta.task"];
    if (taskMetadata && typeof taskMetadata === "object") {
      return taskMetadata as Record<string, unknown>;
    }
    return {};
  }

  private mapEventType(event: MatrixTimelineEvent): WorkspaceEvent["type"] {
    if (event.content.msgtype === "io.letta.control") {
      return "task_control";
    }

    if (event.content.msgtype === "m.text") {
      const ioLettaTask = event.content["io.letta.task"];
      if (ioLettaTask && typeof ioLettaTask === "object") {
        const eventType = (ioLettaTask as Record<string, unknown>)["event_type"];
        if (typeof eventType === "string") {
          return eventType as WorkspaceEvent["type"];
        }
      }
      return "task_message";
    }

    return "task_message";
  }

  getRoomInfoForTask(taskId: string): RoomInfo | undefined {
    const taskEntry = this.registry.getTask(taskId);
    return taskEntry?.matrixRoom;
  }
}
