import { MatrixClientWrapper } from './matrix-client.js';
import type { RoomInfo, Participant, CreateRoomRequest, ArchiveInfo } from './types/matrix.js';

const DEBUG = process.env.DEBUG === 'true';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSummaryHtml(summary: string): string {
  const normalized = summary.trimEnd();
  if (!normalized) {
    return `<h3>Task Completed</h3><p><em>This room will remain available for review.</em></p>`;
  }

  const blocks = normalized.split(/\n{2,}/);
  const [headline, ...rest] = blocks;

  const headlineHtml = escapeHtml(headline).replace(/\n/g, '<br>');
  const bodyHtml = rest
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<h3>${headlineHtml}</h3>${bodyHtml}<p><em>This room will remain available for review.</em></p>`;
}

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[matrix-room-manager]', ...args);
  }
}

export class MatrixRoomManager {
  private matrixClient: MatrixClientWrapper;
  private matrixApiUrl: string;

  constructor(matrixClient: MatrixClientWrapper) {
    this.matrixClient = matrixClient;
    this.matrixApiUrl = process.env.MATRIX_API_URL || 'http://192.168.50.90:8004';
  }

  getMatrixClient(): MatrixClientWrapper {
    return this.matrixClient;
  }

  /**
   * Fetch the existing agent room from the matrix-api service.
   * This leverages the infrastructure maintained by the matrix-client container.
   */
  private async getAgentRoom(agentId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.matrixApiUrl}/agents/${agentId}/room`);
      if (!response.ok) {
        log(`Failed to fetch agent room for ${agentId}: ${response.status}`);
        return null;
      }
      const data = await response.json();
      if (data.success && data.room_id) {
        log(`Found existing room ${data.room_id} for agent ${agentId}`);
        return data.room_id;
      }
      return null;
    } catch (error) {
      log(`Error fetching agent room for ${agentId}:`, error);
      return null;
    }
  }

  async createTaskRoom(request: CreateRoomRequest): Promise<RoomInfo> {
    log(`Creating task room for task ${request.taskId}`);
    console.log(`[matrix-room-manager] humanObservers:`, request.humanObservers);

    // Try to use the existing agent room instead of creating a new one
    console.error(
      `[matrix-room-manager] Attempting to fetch existing room for agent ${request.callingAgentId}`
    );
    const existingRoomId = await this.getAgentRoom(request.callingAgentId);
    console.error(`[matrix-room-manager] getAgentRoom returned:`, existingRoomId);

    if (existingRoomId) {
      log(`Using existing agent room ${existingRoomId} for task ${request.taskId}`);

      // Send task started message to the existing room
      await this.matrixClient.sendHtmlMessage(
        existingRoomId,
        `🚀 Task Execution Started\n\nTask ID: ${request.taskId}\nDescription: ${request.taskDescription}`,
        `<h3>🚀 Task Execution Started</h3>
<p><strong>Task ID:</strong> <code>${request.taskId}</code></p>
<p><strong>Description:</strong> ${request.taskDescription}</p>`,
        {
          'io.letta.task': {
            task_id: request.taskId,
            event_type: 'task_created',
          },
        }
      );

      // Invite human observers if specified
      if (request.humanObservers) {
        for (const humanId of request.humanObservers) {
          if (humanId.startsWith('@')) {
            try {
              await this.matrixClient.inviteUser(existingRoomId, humanId);
              log(`Invited observer ${humanId} to existing room ${existingRoomId}`);
            } catch (error) {
              log(`Failed to invite ${humanId} to room ${existingRoomId}:`, error);
            }
          }
        }
      }

      const roomInfo: RoomInfo = {
        roomId: existingRoomId,
        taskId: request.taskId,
        participants: [
          {
            id: request.callingAgentId,
            type: 'agent',
            role: 'calling_agent',
            invitedAt: Date.now(),
          },
        ],
        createdAt: Date.now(),
        metadata: request.metadata,
      };

      return roomInfo;
    }

    // Fallback: create a new room if agent room not found
    log(`No existing agent room found for ${request.callingAgentId}, creating new task room`);

    const roomName = `Task: ${request.taskId}`;
    const topic = `OpenCode Task: ${request.taskDescription}`;

    const botUserId = this.matrixClient.getUserId();
    const participants: Participant[] = [];

    participants.push({
      id: request.callingAgentId,
      type: 'agent',
      role: 'calling_agent',
      invitedAt: Date.now(),
    });

    if (request.devAgentId) {
      participants.push({
        id: request.devAgentId,
        type: 'agent',
        role: 'dev_agent',
        invitedAt: Date.now(),
      });
    }

    if (request.humanObservers) {
      for (const humanId of request.humanObservers) {
        participants.push({
          id: humanId,
          type: 'human',
          role: 'observer',
          invitedAt: Date.now(),
        });
      }
    }

    const inviteList: string[] = [];
    for (const participant of participants) {
      if (participant.id.startsWith('@')) {
        inviteList.push(participant.id);
      }
    }

    console.log(`[matrix-room-manager] inviteList:`, inviteList);

    const powerLevelContentOverride = {
      users: {
        [botUserId]: 100,
      },
      users_default: 0,
      events: {
        'm.room.name': 50,
        'm.room.power_levels': 100,
        'im.vector.modular.widgets': 50,
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
        if (humanId.startsWith('@')) {
          powerLevelContentOverride.users[humanId] = 0;
        }
      }
    }

    const roomId = await this.matrixClient.createRoom({
      name: roomName,
      topic,
      invite: inviteList,
      visibility: 'private',
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
${participants.map((p) => `<li>${p.role}: <code>${p.id}</code></li>`).join('\n')}
</ul>`,
      {
        'io.letta.task': {
          task_id: request.taskId,
          event_type: 'task_created',
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

    const trimmedSummary = summary.trim();
    const plainText = trimmedSummary || 'Task completed.';
    const metadata: Record<string, unknown> = {
      'io.letta.task': {
        task_id: taskId,
        event_type: 'task_completed',
      },
    };

    try {
      await this.matrixClient.sendHtmlMessage(
        roomId,
        plainText,
        buildSummaryHtml(summary),
        metadata
      );
    } catch (error) {
      console.error(
        `[matrix-room-manager] Failed to send HTML completion summary for task ${taskId} in room ${roomId}, falling back to plain text:`,
        error
      );
      await this.matrixClient.sendMessage(roomId, plainText, metadata);
    }

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

    const role = readOnly ? 'observer' : 'participant';
    await this.matrixClient.sendMessage(roomId, `👤 User ${userId} has been invited as ${role}.`);
  }

  async removeFromRoom(roomId: string, userId: string): Promise<void> {
    log(`Removing user ${userId} from room ${roomId}`);

    await this.matrixClient.kickUser(roomId, userId, 'Removed from task room');

    await this.matrixClient.sendMessage(
      roomId,
      `👤 User ${userId} has been removed from the room.`
    );
  }

  async sendTaskUpdate(
    roomId: string,
    taskId: string,
    message: string,
    eventType: 'progress' | 'error' | 'status_change'
  ): Promise<void> {
    await this.matrixClient.sendMessage(roomId, message, {
      'io.letta.task': {
        task_id: taskId,
        event_type: eventType,
      },
    });
  }

  async sendControlSignal(
    roomId: string,
    taskId: string,
    control: 'cancel' | 'pause' | 'resume',
    reason?: string
  ): Promise<void> {
    await this.matrixClient.sendControlSignal(roomId, taskId, control, reason);
  }
}
