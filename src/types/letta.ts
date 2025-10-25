export interface LettaConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
  maxRetries?: number;
}

export interface LettaAgent {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface LettaMessage {
  id: string;
  agent_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface LettaMemoryBlock {
  id: string;
  label: string;
  description?: string;
  value: string;
  limit?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateMemoryBlockRequest {
  label: string;
  description?: string;
  value: string;
  limit?: number;
}

export interface UpdateMemoryBlockRequest {
  value?: string;
  limit?: number;
}

export interface AttachMemoryBlockRequest {
  block_id: string;
}

export interface SendMessageRequest {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LettaError extends Error {
  status?: number;
  code?: string;
  retryable?: boolean;
}
