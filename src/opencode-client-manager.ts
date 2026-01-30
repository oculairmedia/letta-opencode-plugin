import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk';
import type {
  OpenCodeServerConfig,
  OpenCodeSession,
  OpenCodeEvent,
  SessionInfo,
} from './types/opencode.js';

type RawEvent = {
  type?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

function normalizeCompletionStatus(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim().toLowerCase();
  }
  return undefined;
}

function mapEventType(
  rawType: unknown,
  properties?: Record<string, unknown>
): { type: string; mappedFrom?: string } {
  if (typeof rawType !== 'string') {
    return { type: 'unknown' };
  }

  const originalLower = rawType.toLowerCase();

  const isCompletionKeyword = (lower: string): boolean => {
    if (lower === 'session.idle') {
      return true;
    }
    if (lower === 'finish' || lower === 'finish-step' || lower === 'done' || lower === 'complete') {
      return true;
    }
    if (lower.startsWith('finish:') || lower.startsWith('finish_')) {
      return true;
    }
    if (lower.endsWith(':finish') || lower.endsWith('.finish') || lower.endsWith('_finish')) {
      return true;
    }
    if (lower.endsWith(':complete') || lower.endsWith('.complete') || lower.endsWith('_complete')) {
      return true;
    }
    if (lower.includes('session.complete') || lower.includes('session.finished')) {
      return true;
    }
    if (lower.includes('complete') && !lower.includes('incomplete')) {
      return true;
    }
    if (lower.includes('finished') && !lower.includes('unfinished')) {
      return true;
    }
    if (lower.includes('success') && !lower.includes('unsuccess')) {
      return true;
    }
    return false;
  };

  if (isCompletionKeyword(originalLower)) {
    return { type: 'complete', mappedFrom: rawType };
  }

  if (properties) {
    const statusKeys = ['status', 'state', 'phase', 'result'];
    for (const key of statusKeys) {
      const value = normalizeCompletionStatus(properties[key]);
      if (!value) {
        continue;
      }
      if (
        value === 'complete' ||
        value === 'completed' ||
        value === 'finished' ||
        value === 'success' ||
        value === 'succeeded' ||
        value === 'done'
      ) {
        return { type: 'complete', mappedFrom: `${rawType}:${key}=${value}` };
      }
      if (value === 'timeout' || value === 'cancelled' || value === 'failed') {
        // propagate original type for failure states
        return { type: rawType };
      }
    }
  }

  return { type: rawType };
}

export class OpenCodeClientManager {
  private config: OpenCodeServerConfig;
  private activeSessions: Map<string, OpenCodeSession> = new Map();
  private client: OpencodeClient;

  constructor(config: OpenCodeServerConfig) {
    this.config = config;
    try {
      console.log(`[OpenCodeClient] Initializing client with URL: ${config.serverUrl}`);
      this.client = createOpencodeClient({
        baseUrl: config.serverUrl,
      });
      console.log(`[OpenCodeClient] Client initialized:`, typeof this.client, !!this.client);
    } catch (error) {
      console.error(`[OpenCodeClient] Failed to initialize client:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.serverUrl}/config`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      console.error('[OpenCodeClient] Health check failed:', error);
      return false;
    }
  }

  async createSession(
    taskId: string,
    agentId: string,
    _prompt: string,
    _workingDir?: string
  ): Promise<OpenCodeSession> {
    try {
      if (!this.client) {
        throw new Error('OpenCode client not initialized');
      }
      console.log(`[OpenCodeClient] Creating session for task ${taskId}`);
      // Note: OpenCode 1.0 SDK removed metadata from session.create
      // Task metadata is now passed via the prompt instead
      const sessionResponse = await this.client.session.create({
        body: {
          title: `Task: ${taskId} (agent: ${agentId})`,
        },
      });

      if (sessionResponse.error) {
        throw new Error(`Session creation failed: ${JSON.stringify(sessionResponse.error)}`);
      }

      const sessionId = sessionResponse.data?.id;
      if (!sessionId) {
        throw new Error(`Session creation failed: no ID returned`);
      }

      const session: OpenCodeSession = {
        sessionId,
        taskId,
        agentId,
        startedAt: Date.now(),
        status: 'active',
      };

      this.activeSessions.set(taskId, session);

      console.log(
        `[OpenCodeClient] Session ${sessionId} created and ready. IMPORTANT: Subscribe to events BEFORE calling sendPrompt()`
      );

      return session;
    } catch (error) {
      throw new Error(
        `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async sendPrompt(
    sessionId: string,
    taskId: string,
    agentId: string,
    prompt: string
  ): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('OpenCode client not initialized');
      }

      // Build enhanced prompt with instructions to communicate back to Letta
      const enhancedPrompt = `${prompt}

IMPORTANT: When you complete this task, you MUST send a message back to the calling Letta agent (ID: ${agentId}) with a summary of what you accomplished. Use the available Letta MCP tools to send a message with:
- A brief summary of what you did
- The status (success or failure)
- Any important outputs or files created
- Any issues encountered

Task ID: ${taskId}
Calling Agent ID: ${agentId}`;

      console.log(`[OpenCodeClient] Sending prompt to session ${sessionId}`);
      await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          model: {
            providerID: 'anthropic',
            modelID: 'claude-sonnet-4-5-20250929',
          },
          parts: [{ type: 'text', text: enhancedPrompt }],
        },
      });
      console.log(`[OpenCodeClient] Prompt sent successfully to session ${sessionId}`);
    } catch (error) {
      throw new Error(
        `Failed to send prompt: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async subscribeToEvents(
    sessionId: string,
    onEvent: (event: OpenCodeEvent) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      console.error(`[OpenCodeClient] Subscribing to events for session ${sessionId}...`);
      const subscription = await this.client.event.subscribe();

      // OpenCode 1.0 SDK returns { stream: AsyncGenerator }
      const eventIterable = subscription.stream as AsyncIterable<RawEvent>;

      if (!eventIterable || typeof (eventIterable as any)[Symbol.asyncIterator] !== 'function') {
        throw new Error(
          'Event subscription did not return an async iterable (expected .stream to be AsyncGenerator)'
        );
      }
      console.error(`[OpenCodeClient] Event subscription created, starting event loop...`);

      // Start the event consumption loop
      (async () => {
        try {
          console.error(`[OpenCodeClient] Event loop started for session ${sessionId}`);
          for await (const event of eventIterable) {
            // DEBUG: Log ALL events to understand structure
            console.error(
              `[OpenCodeClient] DEBUG: Received event:`,
              JSON.stringify(
                {
                  type: event.type,
                  properties: event.properties,
                  targetSession: sessionId,
                },
                null,
                2
              )
            );

            // Filter events for this session
            // OpenCode v1.x uses 'sessionID' (capital ID) in various locations:
            // - properties.sessionID (e.g., session.idle, session.error)
            // - properties.info.sessionID (e.g., message.updated, session.updated)
            // - properties.part.sessionID (e.g., message.part.updated)
            const props = event.properties as Record<string, unknown> | undefined;
            const eventSessionId =
              (props?.sessionID as string) ??
              (props?.sessionId as string) ??
              ((props?.info as Record<string, unknown>)?.sessionID as string) ??
              ((props?.info as Record<string, unknown>)?.sessionId as string) ??
              ((props?.part as Record<string, unknown>)?.sessionID as string) ??
              ((props?.part as Record<string, unknown>)?.sessionId as string);

            if (eventSessionId === sessionId) {
              // Map server event types to our internal event types
              console.error(
                `[OpenCodeClient] Raw event received: type=${event.type}, sessionId=${sessionId}`
              );
              const { type: eventType, mappedFrom } = mapEventType(event.type, props);
              if (mappedFrom) {
                console.error(
                  `[OpenCodeClient] Mapping ${mappedFrom} -> ${eventType} for sessionId=${sessionId}`
                );
              }

              const openCodeEvent: OpenCodeEvent = {
                type: eventType as any,
                timestamp: Date.now(),
                sessionId,
                data: event.properties,
              };
              console.error(`[OpenCodeClient] Calling onEvent with type=${openCodeEvent.type}`);
              onEvent(openCodeEvent);
            }
          }
        } catch (error) {
          console.error('[OpenCodeClient] Event stream error:', error);
          if (onError) {
            onError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      })();

      // Give the async event loop a moment to start before returning
      // This ensures the loop is active before the prompt is sent
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.error(`[OpenCodeClient] Event subscription ready for session ${sessionId}`);
    } catch (error) {
      console.error('[OpenCodeClient] Failed to subscribe to events:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async getSessionInfo(sessionId: string): Promise<SessionInfo> {
    try {
      const response = await this.client.session.get({
        path: { id: sessionId },
      });

      if (response.error) {
        throw new Error(`Failed to get session: ${JSON.stringify(response.error)}`);
      }

      const session = response.data;
      return {
        sessionId: session?.id || sessionId,
        status: 'active', // Session object doesn't have status field
        files: [], // Would need to query file.status() separately
        output: '', // Would need to get from messages
        error: undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to get session info: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async abortSession(sessionId: string): Promise<void> {
    try {
      await this.client.session.abort({
        path: { id: sessionId },
      });
    } catch (error) {
      throw new Error(
        `Failed to abort session: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    try {
      await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          model: {
            providerID: 'anthropic',
            modelID: 'claude-sonnet-4-5-20250929',
          },
          parts: [{ type: 'text', text: message }],
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listFiles(_sessionId: string, _path: string = '/'): Promise<string[]> {
    try {
      // OpenCode 1.0 SDK: file.status() returns { data, error }
      const response = await this.client.file.status();

      if (response.error) {
        throw new Error(`Failed to list files: ${JSON.stringify(response.error)}`);
      }

      const files = response.data || [];
      return files.map((f) => f.path);
    } catch (error) {
      throw new Error(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async readFile(sessionId: string, filePath: string): Promise<string> {
    try {
      // OpenCode 1.0 SDK: file.read() uses 'path' query param and returns { data, error }
      const response = await this.client.file.read({
        query: { path: filePath },
      });

      if (response.error) {
        throw new Error(`Failed to read file: ${JSON.stringify(response.error)}`);
      }

      return response.data?.content || '';
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  getActiveSession(taskId: string): OpenCodeSession | undefined {
    return this.activeSessions.get(taskId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      console.log(`[OpenCodeClient] Deleting session ${sessionId} from server`);
      const response = await this.client.session.delete({
        path: { id: sessionId },
      });
      if (response.error) {
        console.warn(
          `[OpenCodeClient] Failed to delete session ${sessionId}: ${JSON.stringify(response.error)}`
        );
      } else {
        console.log(`[OpenCodeClient] Session ${sessionId} deleted successfully`);
      }
    } catch (error) {
      // Non-fatal: log and continue — session may already be gone
      console.warn(
        `[OpenCodeClient] Error deleting session ${sessionId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async listSessions(): Promise<Array<{ id: string; title?: string }>> {
    try {
      const response = await this.client.session.list();
      if (response.error) {
        console.warn(`[OpenCodeClient] Failed to list sessions: ${JSON.stringify(response.error)}`);
        return [];
      }
      const sessions = (response.data as Array<Record<string, unknown>>) || [];
      return sessions.map((s) => ({
        id: String(s.id || ''),
        title: s.title ? String(s.title) : undefined,
      }));
    } catch (error) {
      console.warn(
        `[OpenCodeClient] Error listing sessions:`,
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  removeSession(taskId: string): void {
    this.activeSessions.delete(taskId);
  }

  cleanup(): void {
    this.activeSessions.clear();
  }
}
