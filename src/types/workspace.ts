export interface WorkspaceBlock {
  version: string;
  task_id: string;
  agent_id: string;
  status: "pending" | "running" | "completed" | "failed" | "timeout" | "paused" | "cancelled";
  created_at: number;
  updated_at: number;
  events: WorkspaceEvent[];
  artifacts: WorkspaceArtifact[];
  metadata?: Record<string, unknown>;
}

export type WorkspaceEventType =
  | "task_started"
  | "task_progress"
  | "task_completed"
  | "task_failed"
  | "task_timeout"
  | "task_paused"
  | "task_resumed"
  | "task_cancelled"
  | "task_control"
  | "task_message"
  | "task_feedback"
  | "task_runtime_update";

export interface WorkspaceEvent {
  timestamp: number;
  type: WorkspaceEventType;
  message: string;
  data?: Record<string, unknown>;
}

export interface WorkspaceArtifact {
  timestamp: number;
  type: "file" | "output" | "error" | "log";
  name: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface CreateWorkspaceRequest {
  task_id: string;
  agent_id: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateWorkspaceRequest {
  status?: WorkspaceBlock["status"];
  events?: WorkspaceEvent[];
  artifacts?: WorkspaceArtifact[];
  metadata?: Record<string, unknown>;
}
