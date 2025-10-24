import { MatrixClientWrapper } from "./matrix-client.js";
import type { RoomInfo, Participant, CreateRoomRequest, ArchiveInfo } from "./types/matrix.js";

const DEBUG = process.env.DEBUG === "true";

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.error("[matrix-room-manager]", ...args);
  }
}

export class MatrixRoomManager {
  private matrixClient: MatrixClientWrapper;

  constructor(matrixClient: MatrixClientWrapper) {
    this.matrixClient = matrixClient;
  }

  getMatrixClient(): MatrixClientWrapper {
    return this.matrixClient;
  }

  async createTaskRoom(request: CreateRoomRequest): Promise<RoomInfo> {
    log(`Creating task room for task ${request.taskId}`);

    const roomName = `Task: ${request.taskId}`;
    const topic = `OpenCode Task: ${request.taskDescription}`;
    
    const botUserId = this.matrixClient.getUserId();
    const participants: Participant[] = [];

    participants.push({
      id: request.callingAgentId,
      type: "agent",
      role: "calling_agent",
      invitedAt: Date.now(),
    });

    if (request.devAgentId) {
      participants.push({
        id: request.devAgentId,
        type: "agent",
        role: "dev_agent",
        invitedAt: Date.now(),
      });
    }

    if (request.humanObservers) {
      for (const humanId of request.humanObservers) {
        participants.push({
          id: humanId,
          type: "human",
          role: "observer",
          invitedAt: Date.now(),
        });
      }
    }

    const inviteList: string[] = [];
    for (const participant of participants) {
      if (participant.id.startsWith("@")) {
        inviteList.push(participant.id);
      }
    }

    const powerLevelContentOverride = {
      users: {
        [botUserId]: 100,
      },
      users_default: 0,
      events: {
        "m.room.name": 50,
        "m.room.power_levels": 100,
        "im.vector.modular.widgets": 50,
      },
      events_default: 0,
      state_default: 50,
      ban: 50,
      kick: 50,
      redact: 50,
      invite: 50,
    };

    if (request.humanObservers) {
      for (const humanId of request.humanObservers) {
        if (humanId.startsWith("@")) {
          powerLevelContentOverride.users[humanId] = 0;
        }
      }
    }

    const roomId = await this.matrixClient.createRoom({
      name: roomName,
      topic,
      invite: inviteList,
      visibility: "private",
      powerLevelContentOverride,
    });

    log(`Created room ${roomId} for task ${request.taskId}`);

    await this.matrixClient.sendHtmlMessage(
      roomId,
      `🚀 Task Execution Started\n\nTask ID: ${request.taskId}\nDescription: ${request.taskDescription}`,
      `<h3>🚀 Task Execution Started</h3>
<p><strong>Task ID:</strong> <code>${request.taskId}</code></p>
<p><strong>Description:</strong> ${request.taskDescription}</p>
<p><strong>Participants:</strong></p>
<ul>
${participants.map((p) => `<li>${p.role}: <code>${p.id}</code></li>`).join("\n")}
</ul>`,
      {
        "io.letta.task": {
          task_id: request.taskId,
          event_type: "task_created",
        },
      }
    );

    const roomInfo: RoomInfo = {
      roomId,
      taskId: request.taskId,
      participants,
      createdAt: Date.now(),
      metadata: request.metadata,
    };

    return roomInfo;
  }

  async closeTaskRoom(roomId: string, taskId: string, summary: string): Promise<void> {
    log(`Closing task room ${roomId} for task ${taskId}`);

    await this.matrixClient.sendHtmlMessage(
      roomId,
      `✅ Task Completed\n\n${summary}`,
      `<h3>✅ Task Completed</h3>
<p>${summary}</p>
<p><em>This room will remain available for review.</em></p>`,
      {
        "io.letta.task": {
          task_id: taskId,
          event_type: "task_completed",
        },
      }
    );

    log(`Task room ${roomId} closed`);
  }

  async archiveTaskRoom(roomId: string, taskId: string): Promise<ArchiveInfo> {
    log(`Archiving task room ${roomId} for task ${taskId}`);

    const archiveInfo: ArchiveInfo = {
      roomId,
      taskId,
      archivedAt: Date.now(),
      messageCount: 0,
      participants: [],
    };

    log(`Archived room ${roomId}`);
    return archiveInfo;
  }

  async inviteHumanObserver(roomId: string, humanUserId: string): Promise<void> {
    log(`Inviting human observer ${humanUserId} to room ${roomId}`);
    
    await this.matrixClient.inviteUser(roomId, humanUserId);
    
    await this.matrixClient.sendMessage(
      roomId,
      `👤 Human observer ${humanUserId} has been invited to observe and provide guidance.`
    );
  }

  async inviteToRoom(roomId: string, userId: string, readOnly: boolean = true): Promise<void> {
    log(`Inviting user ${userId} to room ${roomId} (read-only: ${readOnly})`);
    
    await this.matrixClient.inviteUser(roomId, userId);
    
    const role = readOnly ? "observer" : "participant";
    await this.matrixClient.sendMessage(
      roomId,
      `👤 User ${userId} has been invited as ${role}.`
    );
  }

  async removeFromRoom(roomId: string, userId: string): Promise<void> {
    log(`Removing user ${userId} from room ${roomId}`);
    
    await this.matrixClient.kickUser(roomId, userId, "Removed from task room");
    
    await this.matrixClient.sendMessage(
      roomId,
      `👤 User ${userId} has been removed from the room.`
    );
  }

  async sendTaskUpdate(
    roomId: string,
    taskId: string,
    message: string,
    eventType: "progress" | "error" | "status_change"
  ): Promise<void> {
    await this.matrixClient.sendMessage(roomId, message, {
      "io.letta.task": {
        task_id: taskId,
        event_type: eventType,
      },
    });
  }

  async sendControlSignal(
    roomId: string,
    taskId: string,
    control: "cancel" | "pause" | "resume",
    reason?: string
  ): Promise<void> {
    await this.matrixClient.sendControlSignal(roomId, taskId, control, reason);
  }
}
