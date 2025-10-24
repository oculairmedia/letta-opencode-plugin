import { MatrixClient, SimpleFsStorageProvider, AutojoinRoomsMixin } from "matrix-bot-sdk";

export interface MatrixConfig {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  storagePath?: string;
}

export class MatrixClientWrapper {
  private client: MatrixClient;
  private config: MatrixConfig;

  constructor(config: MatrixConfig) {
    this.config = config;
    const storage = new SimpleFsStorageProvider(
      config.storagePath || "./.matrix-storage.json"
    );
    this.client = new MatrixClient(config.homeserverUrl, config.accessToken, storage);
    AutojoinRoomsMixin.setupOnClient(this.client);
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async stop(): Promise<void> {
    await this.client.stop();
  }

  async createRoom(options: {
    name: string;
    topic?: string;
    invite?: string[];
    visibility?: "public" | "private";
    powerLevelContentOverride?: Record<string, unknown>;
  }): Promise<string> {
    const roomId = await this.client.createRoom({
      name: options.name,
      topic: options.topic,
      invite: options.invite,
      visibility: options.visibility || "private",
      initial_state: options.powerLevelContentOverride
        ? [
            {
              type: "m.room.power_levels",
              state_key: "",
              content: options.powerLevelContentOverride,
            },
          ]
        : [],
    });
    return roomId;
  }

  async inviteUser(roomId: string, userId: string): Promise<void> {
    await this.client.inviteUser(userId, roomId);
  }

  async sendMessage(
    roomId: string,
    text: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const content: Record<string, unknown> = {
      msgtype: "m.text",
      body: text,
    };

    if (metadata) {
      Object.assign(content, metadata);
    }

    return await this.client.sendMessage(roomId, content);
  }

  async sendHtmlMessage(
    roomId: string,
    text: string,
    html: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const content: Record<string, unknown> = {
      msgtype: "m.text",
      body: text,
      format: "org.matrix.custom.html",
      formatted_body: html,
    };

    if (metadata) {
      Object.assign(content, metadata);
    }

    return await this.client.sendMessage(roomId, content);
  }

  async sendControlSignal(
    roomId: string,
    taskId: string,
    control: "cancel" | "pause" | "resume",
    reason?: string
  ): Promise<string> {
    const content = {
      msgtype: "io.letta.control",
      "io.letta.task": {
        task_id: taskId,
        control,
        reason,
      },
    };

    return await this.client.sendMessage(roomId, content);
  }

  async getRoomState(roomId: string): Promise<unknown> {
    return await this.client.getRoomState(roomId);
  }

  async setRoomTopic(roomId: string, topic: string): Promise<void> {
    await this.client.sendStateEvent(roomId, "m.room.topic", "", { topic });
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.client.leaveRoom(roomId);
  }

  async kickUser(roomId: string, userId: string, reason?: string): Promise<void> {
    await this.client.kickUser(userId, roomId, reason);
  }

  getUserId(): string {
    return this.config.userId;
  }

  getClient(): MatrixClient {
    return this.client;
  }
}
