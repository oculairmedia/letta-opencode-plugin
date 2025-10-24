export interface ExecutionConfig {
  image: string;
  cpuLimit?: string;
  memoryLimit?: string;
  timeoutMs: number;
  gracePeriodMs?: number;
  openCodeServerUrl?: string;
  openCodeServerEnabled?: boolean;
  workspaceDir?: string;
}

export interface ExecutionRequest {
  taskId: string;
  agentId: string;
  prompt: string;
  workspaceBlockId: string;
  timeout?: number;
}

export interface ExecutionResult {
  taskId: string;
  status: "success" | "timeout" | "error";
  exitCode?: number;
  output: string;
  error?: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
}

export interface ContainerInfo {
  containerId: string;
  taskId: string;
  startedAt: number;
  sessionId?: string;
  serverUrl?: string;
}
