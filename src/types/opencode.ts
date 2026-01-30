export interface OpenCodeServerConfig {
  enabled: boolean;
  serverUrl: string;
  healthCheckIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface OpenCodeSession {
  sessionId: string;
  taskId: string;
  agentId: string;
  startedAt: number;
  status: 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
}

export interface OpenCodeEvent {
  type:
    | 'start'
    | 'output'
    | 'error'
    | 'tool_call'
    | 'file_change'
    | 'complete'
    | 'abort'
    | 'message.updated'
    | 'message.part.updated'
    | 'message.removed'
    | 'message.part.removed'
    | 'session.updated'
    | 'session.deleted'
    | 'session.idle'
    | 'session.error'
    | 'session.status'
    | 'session.diff'
    | 'file.edited'
    | 'file.watcher.updated'
    | 'permission.updated'
    | 'storage.write'
    | 'server.heartbeat'
    | 'server.connected'
    | string;
  timestamp: number;
  sessionId: string;
  data: unknown;
}

export interface FileOperation {
  path: string;
  type: 'create' | 'modify' | 'delete' | 'read';
  timestamp: number;
}

export interface SessionInfo {
  sessionId: string;
  status: 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  files: FileOperation[];
  output: string;
  error?: string;
}
