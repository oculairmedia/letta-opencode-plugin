import { OpenCodeClientManager } from "../../src/opencode-client-manager.js";
import type { OpenCodeEvent } from "../../src/types/opencode.js";

// Create mock client that will be returned by createOpencodeClient
const mockClient = {
  session: {
    create: jest.fn(),
    prompt: jest.fn(),
    get: jest.fn(),
    abort: jest.fn(),
  },
  event: {
    subscribe: jest.fn(),
  },
  file: {
    status: jest.fn(),
    read: jest.fn(),
  },
};

// Mock the @opencode-ai/sdk module
jest.mock("@opencode-ai/sdk", () => ({
  createOpencodeClient: jest.fn(() => mockClient),
}));

// Mock fetch globally
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe("OpenCodeClientManager", () => {
  let manager: OpenCodeClientManager;

  beforeEach(() => {
    jest.clearAllMocks();

    manager = new OpenCodeClientManager({
      enabled: true,
      serverUrl: "http://localhost:3100",
      healthCheckIntervalMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
    });
  });

  describe("constructor", () => {
    it("should initialize with config", () => {
      expect(manager).toBeDefined();
    });

    it("should create OpenCode client with server URL", () => {
      const { createOpencodeClient } = require("@opencode-ai/sdk");
      expect(createOpencodeClient).toHaveBeenCalledWith({
        baseUrl: "http://localhost:3100",
      });
    });
  });

  describe("healthCheck", () => {
    it("should return true when server is healthy", async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
      } as Response);

      const result = await manager.healthCheck();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3100/config",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("should return false when server is unhealthy", async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
      } as Response);

      const result = await manager.healthCheck();

      expect(result).toBe(false);
    });

    it("should return false on network error", async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Network error")
      );

      const result = await manager.healthCheck();

      expect(result).toBe(false);
    });

    it("should timeout after 5 seconds", async () => {
      await manager.healthCheck();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe("createSession", () => {
    it("should extract session ID from SDK response.data.id format", async () => {
      // Guard against SDK response format regression
      // The SDK returns {data: {id: "ses_xxx", ...}, request: {}, response: {}}
      mockClient.session.create.mockResolvedValue({
        data: {
          id: "ses_test123",
          version: "0.15.0",
          projectID: "global",
          directory: "/workspace",
          title: "Task: task-123",
          time: {
            created: Date.now(),
            updated: Date.now(),
          },
        },
        request: {},
        response: {},
      });

      mockClient.session.prompt.mockResolvedValue({});

      const session = await manager.createSession(
        "task-123",
        "agent-456",
        "Test prompt"
      );

      expect(session.sessionId).toBe("ses_test123");
      expect(session.taskId).toBe("task-123");
      expect(session.agentId).toBe("agent-456");
      expect(session.status).toBe("active");
    });

    it("should handle legacy format with direct id property", async () => {
      // Fallback for if SDK changes to return id directly
      mockClient.session.create.mockResolvedValue({
        id: "session-legacy",
        status: "active",
      });

      mockClient.session.prompt.mockResolvedValue({});

      const session = await manager.createSession(
        "task-legacy",
        "agent-456",
        "Test prompt"
      );

      expect(session.sessionId).toBe("session-legacy");
    });

    it("should throw error when no session ID is returned", async () => {
      // Guard against malformed SDK responses
      mockClient.session.create.mockResolvedValue({
        data: {
          version: "0.15.0",
          // Missing 'id' field
        },
      });

      await expect(
        manager.createSession("task-123", "agent-456", "Test prompt")
      ).rejects.toThrow("Session creation failed: no ID returned");
    });

    it("should create session with task details", async () => {
      mockClient.session.create.mockResolvedValue({
        data: {
          id: "session-123",
          version: "0.15.0",
          projectID: "global",
          directory: "/workspace",
          title: "Task: task-123",
          time: { created: Date.now(), updated: Date.now() },
        },
      });

      mockClient.session.prompt.mockResolvedValue({});

      const session = await manager.createSession(
        "task-123",
        "agent-456",
        "Test prompt"
      );

      expect(session).toEqual({
        sessionId: "session-123",
        taskId: "task-123",
        agentId: "agent-456",
        startedAt: expect.any(Number),
        status: "active",
      });

      expect(mockClient.session.create).toHaveBeenCalledWith({
        body: {
          title: "Task: task-123",
          metadata: {
            taskId: "task-123",
            agentId: "agent-456",
            workingDir: "/workspace",
          },
        },
      });
    });

    it("should send initial prompt after session creation", async () => {
      mockClient.session.create.mockResolvedValue({
        id: "session-123",
        status: "active",
      });

      mockClient.session.prompt.mockResolvedValue({});

      await manager.createSession("task-123", "agent-456", "Test prompt");

      expect(mockClient.session.prompt).toHaveBeenCalledWith({
        path: { id: "session-123" },
        body: {
          parts: [{ type: "text", text: "Test prompt" }],
        },
      });
    });

    it("should use custom working directory when provided", async () => {
      mockClient.session.create.mockResolvedValue({
        id: "session-123",
        status: "active",
      });

      mockClient.session.prompt.mockResolvedValue({});

      await manager.createSession(
        "task-123",
        "agent-456",
        "Test prompt",
        "/custom/path"
      );

      expect(mockClient.session.create).toHaveBeenCalledWith({
        body: expect.objectContaining({
          metadata: expect.objectContaining({
            workingDir: "/custom/path",
          }),
        }),
      });
    });

    it("should store session in active sessions", async () => {
      mockClient.session.create.mockResolvedValue({
        id: "session-123",
        status: "active",
      });

      mockClient.session.prompt.mockResolvedValue({});

      await manager.createSession("task-123", "agent-456", "Test prompt");

      const activeSession = manager.getActiveSession("task-123");
      expect(activeSession).toBeDefined();
      expect(activeSession?.sessionId).toBe("session-123");
    });

    it("should throw error on session creation failure", async () => {
      mockClient.session.create.mockRejectedValue(
        new Error("Server error")
      );

      await expect(
        manager.createSession("task-123", "agent-456", "Test prompt")
      ).rejects.toThrow("Failed to create session: Server error");
    });

    it("should handle non-Error exceptions", async () => {
      mockClient.session.create.mockRejectedValue("String error");

      await expect(
        manager.createSession("task-123", "agent-456", "Test prompt")
      ).rejects.toThrow("Failed to create session: String error");
    });
  });

  describe("subscribeToEvents", () => {
    it("should subscribe to session events", async () => {
      const mockStream = {
        stream: (async function* () {
          yield {
            type: "output",
            properties: {
              sessionId: "session-123",
              data: "Test output",
            },
          };
        })(),
      };

      mockClient.event.subscribe.mockResolvedValue(mockStream);

      const onEvent = jest.fn();
      const onError = jest.fn();

      await manager.subscribeToEvents("session-123", onEvent, onError);

      // Wait for async iteration to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockClient.event.subscribe).toHaveBeenCalled();
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "output",
          sessionId: "session-123",
          timestamp: expect.any(Number),
        })
      );
    });

    it("should filter events by session ID", async () => {
      const mockStream = {
        stream: (async function* () {
          yield {
            type: "output",
            properties: {
              sessionId: "session-123",
              data: "Test output",
            },
          };
          yield {
            type: "output",
            properties: {
              sessionId: "session-456",
              data: "Other session output",
            },
          };
        })(),
      };

      mockClient.event.subscribe.mockResolvedValue(mockStream);

      const onEvent = jest.fn();

      await manager.subscribeToEvents("session-123", onEvent);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-123",
        })
      );
    });

    it("should call onError when event stream fails", async () => {
      const mockStream = {
        stream: (async function* () {
          throw new Error("Stream error");
        })(),
      };

      mockClient.event.subscribe.mockResolvedValue(mockStream);

      const onEvent = jest.fn();
      const onError = jest.fn();

      await manager.subscribeToEvents("session-123", onEvent, onError);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("should call onError when subscription fails", async () => {
      mockClient.event.subscribe.mockRejectedValue(new Error("Subscribe error"));

      const onEvent = jest.fn();
      const onError = jest.fn();

      await manager.subscribeToEvents("session-123", onEvent, onError);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Subscribe error",
        })
      );
    });

    it("should handle non-Error exceptions in event stream", async () => {
      const mockStream = {
        stream: (async function* () {
          throw "String error";
        })(),
      };

      mockClient.event.subscribe.mockResolvedValue(mockStream);

      const onEvent = jest.fn();
      const onError = jest.fn();

      await manager.subscribeToEvents("session-123", onEvent, onError);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onError).toHaveBeenCalled();
    });

    it("should not fail if onError is not provided", async () => {
      mockClient.event.subscribe.mockRejectedValue(new Error("Subscribe error"));

      const onEvent = jest.fn();

      await expect(
        manager.subscribeToEvents("session-123", onEvent)
      ).resolves.not.toThrow();
    });
  });

  describe("getSessionInfo", () => {
    it("should return session info", async () => {
      mockClient.session.get.mockResolvedValue({
        id: "session-123",
        status: "active",
        error: undefined,
      });

      const info = await manager.getSessionInfo("session-123");

      expect(info).toEqual({
        sessionId: "session-123",
        status: "active",
        files: [],
        output: "",
        error: undefined,
      });

      expect(mockClient.session.get).toHaveBeenCalledWith({
        path: { id: "session-123" },
      });
    });

    it("should include error when session has error", async () => {
      mockClient.session.get.mockResolvedValue({
        id: "session-123",
        status: "error",
        error: "Task failed",
      });

      const info = await manager.getSessionInfo("session-123");

      expect(info.error).toBe("Task failed");
    });

    it("should default to active status when not provided", async () => {
      mockClient.session.get.mockResolvedValue({
        id: "session-123",
      });

      const info = await manager.getSessionInfo("session-123");

      expect(info.status).toBe("active");
    });

    it("should throw error on failure", async () => {
      mockClient.session.get.mockRejectedValue(new Error("Not found"));

      await expect(manager.getSessionInfo("session-123")).rejects.toThrow(
        "Failed to get session info: Not found"
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockClient.session.get.mockRejectedValue("String error");

      await expect(manager.getSessionInfo("session-123")).rejects.toThrow(
        "Failed to get session info: String error"
      );
    });
  });

  describe("abortSession", () => {
    it("should abort session", async () => {
      mockClient.session.abort.mockResolvedValue({});

      await manager.abortSession("session-123");

      expect(mockClient.session.abort).toHaveBeenCalledWith({
        path: { id: "session-123" },
      });
    });

    it("should throw error on failure", async () => {
      mockClient.session.abort.mockRejectedValue(new Error("Abort failed"));

      await expect(manager.abortSession("session-123")).rejects.toThrow(
        "Failed to abort session: Abort failed"
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockClient.session.abort.mockRejectedValue("String error");

      await expect(manager.abortSession("session-123")).rejects.toThrow(
        "Failed to abort session: String error"
      );
    });
  });

  describe("sendMessage", () => {
    it("should send message to session", async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
      } as Response);

      await manager.sendMessage("session-123", "Test message");

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:3100/session/session-123/message",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Test message" }),
        }
      );
    });

    it("should throw error on failure", async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response);

      await expect(
        manager.sendMessage("session-123", "Test message")
      ).rejects.toThrow("Failed to send message: 500 Internal Server Error");
    });

    it("should handle network errors", async () => {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Network error")
      );

      await expect(
        manager.sendMessage("session-123", "Test message")
      ).rejects.toThrow("Network error");
    });
  });

  describe("listFiles", () => {
    it("should list files in root directory", async () => {
      mockClient.file.status.mockResolvedValue([
        { path: "/file1.txt" },
        { path: "/file2.txt" },
      ]);

      const files = await manager.listFiles("session-123");

      expect(files).toEqual(["/file1.txt", "/file2.txt"]);
      expect(mockClient.file.status).toHaveBeenCalledWith({
        query: undefined,
      });
    });

    it("should list files in specific path", async () => {
      mockClient.file.status.mockResolvedValue([
        { path: "/src/file1.ts" },
        { path: "/src/file2.ts" },
      ]);

      const files = await manager.listFiles("session-123", "/src");

      expect(files).toEqual(["/src/file1.ts", "/src/file2.ts"]);
      expect(mockClient.file.status).toHaveBeenCalledWith({
        query: { path: "/src" },
      });
    });

    it("should return empty array when no files", async () => {
      mockClient.file.status.mockResolvedValue([]);

      const files = await manager.listFiles("session-123");

      expect(files).toEqual([]);
    });

    it("should throw error on failure", async () => {
      mockClient.file.status.mockRejectedValue(new Error("List failed"));

      await expect(manager.listFiles("session-123")).rejects.toThrow(
        "Failed to list files: List failed"
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockClient.file.status.mockRejectedValue("String error");

      await expect(manager.listFiles("session-123")).rejects.toThrow(
        "Failed to list files: String error"
      );
    });
  });

  describe("readFile", () => {
    it("should read file content", async () => {
      mockClient.file.read.mockResolvedValue({
        content: "File content here",
      });

      const content = await manager.readFile("session-123", "/test.txt");

      expect(content).toBe("File content here");
      expect(mockClient.file.read).toHaveBeenCalledWith({
        query: { path: "/test.txt" },
      });
    });

    it("should handle empty files", async () => {
      mockClient.file.read.mockResolvedValue({
        content: "",
      });

      const content = await manager.readFile("session-123", "/empty.txt");

      expect(content).toBe("");
    });

    it("should throw error on failure", async () => {
      mockClient.file.read.mockRejectedValue(new Error("Read failed"));

      await expect(
        manager.readFile("session-123", "/test.txt")
      ).rejects.toThrow("Failed to read file: Read failed");
    });

    it("should handle non-Error exceptions", async () => {
      mockClient.file.read.mockRejectedValue("String error");

      await expect(
        manager.readFile("session-123", "/test.txt")
      ).rejects.toThrow("Failed to read file: String error");
    });
  });

  describe("getActiveSession", () => {
    it("should return active session", async () => {
      mockClient.session.create.mockResolvedValue({
        id: "session-123",
        status: "active",
      });

      mockClient.session.prompt.mockResolvedValue({});

      await manager.createSession("task-123", "agent-456", "Test prompt");

      const session = manager.getActiveSession("task-123");

      expect(session).toBeDefined();
      expect(session?.sessionId).toBe("session-123");
      expect(session?.taskId).toBe("task-123");
    });

    it("should return undefined for non-existent session", () => {
      const session = manager.getActiveSession("nonexistent-task");

      expect(session).toBeUndefined();
    });
  });

  describe("removeSession", () => {
    it("should remove session from active sessions", async () => {
      mockClient.session.create.mockResolvedValue({
        id: "session-123",
        status: "active",
      });

      mockClient.session.prompt.mockResolvedValue({});

      await manager.createSession("task-123", "agent-456", "Test prompt");

      expect(manager.getActiveSession("task-123")).toBeDefined();

      manager.removeSession("task-123");

      expect(manager.getActiveSession("task-123")).toBeUndefined();
    });

    it("should not throw error for non-existent session", () => {
      expect(() => manager.removeSession("nonexistent-task")).not.toThrow();
    });
  });

  describe("cleanup", () => {
    it("should clear all active sessions", async () => {
      mockClient.session.create.mockResolvedValue({
        id: "session-123",
        status: "active",
      });

      mockClient.session.prompt.mockResolvedValue({});

      await manager.createSession("task-1", "agent-1", "Test 1");
      await manager.createSession("task-2", "agent-2", "Test 2");

      expect(manager.getActiveSession("task-1")).toBeDefined();
      expect(manager.getActiveSession("task-2")).toBeDefined();

      manager.cleanup();

      expect(manager.getActiveSession("task-1")).toBeUndefined();
      expect(manager.getActiveSession("task-2")).toBeUndefined();
    });

    it("should not throw error when no active sessions", () => {
      expect(() => manager.cleanup()).not.toThrow();
    });
  });
});
