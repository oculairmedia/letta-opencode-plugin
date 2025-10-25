// @ts-ignore - SDK has no TypeScript definitions
import { createOpencodeClient } from "@opencode-ai/sdk";
import type {
  OpenCodeServerConfig,
  OpenCodeSession,
  OpenCodeEvent,
  SessionInfo,
} from "./types/opencode.js";

function normalizeCompletionStatus(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().toLowerCase();
  }
  return undefined;
}

function mapEventType(
  rawType: unknown,
  properties?: Record<string, unknown>
): { type: string; mappedFrom?: string } {
  if (typeof rawType !== "string") {
    return { type: "unknown" };
  }

  const originalLower = rawType.toLowerCase();

  const isCompletionKeyword = (lower: string): boolean => {
    if (lower === "finish" || lower === "finish-step" || lower === "done" || lower === "complete") {
      return true;
    }
    if (lower.startsWith("finish:") || lower.startsWith("finish_")) {
      return true;
    }
    if (lower.endsWith(":finish") || lower.endsWith(".finish") || lower.endsWith("_finish")) {
      return true;
    }
    if (lower.endsWith(":complete") || lower.endsWith(".complete") || lower.endsWith("_complete")) {
      return true;
    }
    if (lower.includes("session.complete") || lower.includes("session.finished")) {
      return true;
    }
    if (lower.includes("complete") && !lower.includes("incomplete")) {
      return true;
    }
    if (lower.includes("finished") && !lower.includes("unfinished")) {
      return true;
    }
    if (lower.includes("success") && !lower.includes("unsuccess")) {
      return true;
    }
    return false;
  };

  if (isCompletionKeyword(originalLower)) {
    return { type: "complete", mappedFrom: rawType };
  }

  if (properties) {
    const statusKeys = ["status", "state", "phase", "result"];
    for (const key of statusKeys) {
      const value = normalizeCompletionStatus(properties[key]);
      if (!value) {
        continue;
      }
      if (
        value === "complete" ||
        value === "completed" ||
        value === "finished" ||
        value === "success" ||
        value === "succeeded" ||
        value === "done"
      ) {
        return { type: "complete", mappedFrom: `${rawType}:${key}=${value}` };
      }
      if (value === "timeout" || value === "cancelled" || value === "failed") {
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
  private client: any;

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
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      console.error("[OpenCodeClient] Health check failed:", error);
      return false;
    }
  }

  async createSession(
    taskId: string,
    agentId: string,
    prompt: string,
    workingDir?: string
  ): Promise<OpenCodeSession> {
    try {
      if (!this.client) {
        throw new Error("OpenCode client not initialized");
      }
      console.log(`[OpenCodeClient] Creating session for task ${taskId}`);
      const sessionResponse = await this.client.session.create({
        body: {
          title: `Task: ${taskId}`,
          metadata: {
            taskId,
            agentId,
            workingDir: workingDir || "/workspace",
          },
        },
      });

      const sessionId = sessionResponse.data?.id || sessionResponse.id;
      if (!sessionId) {
        throw new Error(`Session creation failed: no ID returned`);
      }

      const session: OpenCodeSession = {
        sessionId,
        taskId,
        agentId,
        startedAt: Date.now(),
        status: "active",
      };

      this.activeSessions.set(taskId, session);

      console.log(`[OpenCodeClient] Session ${sessionId} created and ready. IMPORTANT: Subscribe to events BEFORE calling sendPrompt()`);

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
        throw new Error("OpenCode client not initialized");
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
            providerID: "anthropic",
            modelID: "claude-sonnet-4-5-20250929"
          },
          parts: [{ type: "text", text: enhancedPrompt }],
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
      const events = await this.client.event.subscribe();
      const eventIterable =
        events && typeof events === "object" && "stream" in events && events.stream
          ? events.stream
          : events;

      if (!eventIterable || typeof (eventIterable as any)[Symbol.asyncIterator] !== "function") {
        throw new Error("Event subscription did not return an async iterable");
      }
      console.error(`[OpenCodeClient] Event subscription created, starting event loop...`);

      // Start the event consumption loop
      (async () => {
        try {
          console.error(`[OpenCodeClient] Event loop started for session ${sessionId}`);
          for await (const event of eventIterable) {
            // DEBUG: Log ALL events to understand structure
            console.error(`[OpenCodeClient] DEBUG: Received event:`, JSON.stringify({
              type: event.type,
              properties: event.properties,
              targetSession: sessionId
            }, null, 2));

            // Filter events for this session
            if (event.properties?.sessionId === sessionId) {
              // Map server event types to our internal event types
              console.error(`[OpenCodeClient] Raw event received: type=${event.type}, sessionId=${sessionId}`);
              const { type: eventType, mappedFrom } = mapEventType(
                event.type,
                event.properties as Record<string, unknown> | undefined
              );
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
          console.error("[OpenCodeClient] Event stream error:", error);
          if (onError) {
            onError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      })();

      // Give the async event loop a moment to start before returning
      // This ensures the loop is active before the prompt is sent
      await new Promise(resolve => setTimeout(resolve, 100));
      console.error(`[OpenCodeClient] Event subscription ready for session ${sessionId}`);
    } catch (error) {
      console.error("[OpenCodeClient] Failed to subscribe to events:", error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async getSessionInfo(sessionId: string): Promise<SessionInfo> {
    try {
      const session = await this.client.session.get({
        path: { id: sessionId },
      });

      return {
        sessionId: session.id,
        status: session.status || "active",
        files: [], // Would need to query file.status() separately
        output: "", // Would need to get from messages
        error: session.error,
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
            providerID: "anthropic",
            modelID: "claude-sonnet-4-5-20250929"
          },
          parts: [{ type: "text", text: message }],
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listFiles(sessionId: string, path: string = "/"): Promise<string[]> {
    try {
      const files = await this.client.file.status({
        query: path !== "/" ? { path } : undefined,
      });

      return files.map((f: any) => f.path);
    } catch (error) {
      throw new Error(
        `Failed to list files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async readFile(sessionId: string, filePath: string): Promise<string> {
    try {
      const fileData = await this.client.file.read({
        query: { path: filePath },
      });

      return fileData.content;
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  getActiveSession(taskId: string): OpenCodeSession | undefined {
    return this.activeSessions.get(taskId);
  }

  removeSession(taskId: string): void {
    this.activeSessions.delete(taskId);
  }

  cleanup(): void {
    this.activeSessions.clear();
  }
}
