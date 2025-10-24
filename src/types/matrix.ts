export interface RoomInfo {
  roomId: string;
  roomAlias?: string;
  taskId: string;
  participants: Participant[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface Participant {
  id: string;
  type: "agent" | "human";
  role: "calling_agent" | "dev_agent" | "observer";
  invitedAt: number;
}

export interface CreateRoomRequest {
  taskId: string;
  taskDescription: string;
  callingAgentId: string;
  devAgentId?: string;
  humanObservers?: string[];
  metadata?: Record<string, unknown>;
}

export interface ArchiveInfo {
  roomId: string;
  taskId: string;
  archivedAt: number;
  messageCount: number;
  participants: Participant[];
  archivePath?: string;
}
