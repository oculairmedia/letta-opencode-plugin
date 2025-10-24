import {
  ControlSignalHandler,
  type ControlSignalRequest,
  type ControlSignalHandlerDependencies,
} from "../../src/control-signal-handler.js";
import type { ExecutionManager } from "../../src/execution-manager.js";
import type { TaskRegistry } from "../../src/task-registry.js";
import type { WorkspaceManager } from "../../src/workspace-manager.js";
import type { MatrixRoomManager } from "../../src/matrix-room-manager.js";

describe("ControlSignalHandler", () => {
  let handler: ControlSignalHandler;
  let mockDeps: jest.Mocked<ControlSignalHandlerDependencies>;
  let mockExecution: jest.Mocked<ExecutionManager>;
  let mockRegistry: jest.Mocked<TaskRegistry>;
  let mockWorkspace: jest.Mocked<WorkspaceManager>;
  let mockMatrix: jest.Mocked<MatrixRoomManager> | null;

  beforeEach(() => {
    jest.clearAllMocks();

    mockExecution = {
      cancelTask: jest.fn(),
      pauseTask: jest.fn(),
      resumeTask: jest.fn(),
      isTaskActive: jest.fn(),
    } as unknown as jest.Mocked<ExecutionManager>;

    mockRegistry = {
      getTask: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockWorkspace = {
      updateWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceManager>;

    mockMatrix = null;

    mockDeps = {
      execution: mockExecution,
      registry: mockRegistry,
      workspace: mockWorkspace,
      matrix: mockMatrix,
    };

    handler = new ControlSignalHandler(mockDeps);
  });

  describe("handleControlSignal", () => {
    it("should return error when task not found", async () => {
      mockRegistry.getTask.mockReturnValue(undefined);

      const request: ControlSignalRequest = {
        taskId: "nonexistent-task",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: false,
        taskId: "nonexistent-task",
        signal: "cancel",
        error: "Task not found in registry",
      });
    });

    it("should handle cancel signal", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
        reason: "Test cancel",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(true);
      expect(result.signal).toBe("cancel");
    });

    it("should handle pause signal", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.pauseTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "pause",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(true);
      expect(result.signal).toBe("pause");
    });

    it("should handle resume signal", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "paused",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.resumeTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "resume",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(true);
      expect(result.signal).toBe("resume");
    });
  });

  describe("handleCancel", () => {
    it("should cancel running task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
        reason: "Cancelling for test",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: true,
        taskId: "task-123",
        signal: "cancel",
        previousStatus: "running",
        newStatus: "cancelled",
      });
      expect(mockExecution.cancelTask).toHaveBeenCalledWith("task-123");
      expect(mockRegistry.updateStatus).toHaveBeenCalledWith("task-123", "cancelled");
    });

    it("should not cancel completed task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "completed",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: false,
        taskId: "task-123",
        signal: "cancel",
        previousStatus: "completed",
        error: "Cannot cancel task with status: completed",
      });
      expect(mockExecution.cancelTask).not.toHaveBeenCalled();
    });

    it("should not cancel failed task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "failed",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot cancel task with status: failed");
    });

    it("should not cancel already cancelled task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "cancelled",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot cancel task with status: cancelled");
    });

    it("should return error if cancel fails and task still active", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(false);
      mockExecution.isTaskActive.mockReturnValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: false,
        taskId: "task-123",
        signal: "cancel",
        previousStatus: "running",
        error: "Failed to cancel task execution",
      });
      expect(mockRegistry.updateStatus).not.toHaveBeenCalled();
    });

    it("should succeed if cancel returns false but task inactive", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(false);
      mockExecution.isTaskActive.mockReturnValue(false);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(true);
      expect(mockRegistry.updateStatus).toHaveBeenCalledWith("task-123", "cancelled");
    });

    it("should update workspace with cancel event", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
        reason: "User requested cancellation",
      };

      await handler.handleControlSignal(request);

      expect(mockWorkspace.updateWorkspace).toHaveBeenCalledWith(
        "agent-456",
        "block-789",
        {
          status: "cancelled",
          events: [
            {
              timestamp: expect.any(Number),
              type: "task_cancelled",
              message: "User requested cancellation",
              data: { requested_by: "user-123" },
            },
          ],
        }
      );
    });

    it("should use default message when no reason provided", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      await handler.handleControlSignal(request);

      expect(mockWorkspace.updateWorkspace).toHaveBeenCalledWith(
        "agent-456",
        "block-789",
        expect.objectContaining({
          events: [
            expect.objectContaining({
              message: "Task cancelled by control signal",
            }),
          ],
        })
      );
    });

    it("should notify Matrix when available", async () => {
      const mockMatrixManager = {
        sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MatrixRoomManager>;

      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
        matrixRoom: {
          roomId: "!room123:matrix.org",
          createdAt: 1000,
        },
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const depsWithMatrix = {
        ...mockDeps,
        matrix: mockMatrixManager,
      };

      const handlerWithMatrix = new ControlSignalHandler(depsWithMatrix);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      await handlerWithMatrix.handleControlSignal(request);

      expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
        "!room123:matrix.org",
        "task-123",
        "Task cancelled",
        "status_change"
      );
    });

    it("should handle workspace update errors gracefully", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);
      mockWorkspace.updateWorkspace.mockRejectedValue(new Error("Workspace error"));

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(true);
    });

    it("should handle Matrix notification errors gracefully", async () => {
      const mockMatrixManager = {
        sendTaskUpdate: jest.fn().mockRejectedValue(new Error("Matrix error")),
      } as unknown as jest.Mocked<MatrixRoomManager>;

      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
        matrixRoom: {
          roomId: "!room123:matrix.org",
          createdAt: 1000,
        },
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const depsWithMatrix = {
        ...mockDeps,
        matrix: mockMatrixManager,
      };

      const handlerWithMatrix = new ControlSignalHandler(depsWithMatrix);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      const result = await handlerWithMatrix.handleControlSignal(request);

      expect(result.success).toBe(true);
    });
  });

  describe("handlePause", () => {
    it("should pause running task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.pauseTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "pause",
        requestedBy: "user-123",
        reason: "Pausing for review",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: true,
        taskId: "task-123",
        signal: "pause",
        previousStatus: "running",
        newStatus: "paused",
      });
      expect(mockExecution.pauseTask).toHaveBeenCalledWith("task-123");
      expect(mockRegistry.updateStatus).toHaveBeenCalledWith("task-123", "paused");
    });

    it("should not pause queued task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "queued",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "pause",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: false,
        taskId: "task-123",
        signal: "pause",
        previousStatus: "queued",
        error: "Cannot pause task with status: queued",
      });
      expect(mockExecution.pauseTask).not.toHaveBeenCalled();
    });

    it("should not pause completed task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "completed",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "pause",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot pause task with status: completed");
    });

    it("should return error if pause fails", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.pauseTask.mockResolvedValue(false);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "pause",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: false,
        taskId: "task-123",
        signal: "pause",
        previousStatus: "running",
        error: "Failed to pause task execution",
      });
      expect(mockRegistry.updateStatus).not.toHaveBeenCalled();
    });

    it("should update workspace with pause event", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.pauseTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "pause",
        requestedBy: "user-123",
        reason: "Pause for debugging",
      };

      await handler.handleControlSignal(request);

      expect(mockWorkspace.updateWorkspace).toHaveBeenCalledWith(
        "agent-456",
        "block-789",
        {
          status: "paused",
          events: [
            {
              timestamp: expect.any(Number),
              type: "task_paused",
              message: "Pause for debugging",
              data: { requested_by: "user-123" },
            },
          ],
        }
      );
    });

    it("should notify Matrix when pausing", async () => {
      const mockMatrixManager = {
        sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MatrixRoomManager>;

      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
        matrixRoom: {
          roomId: "!room123:matrix.org",
          createdAt: 1000,
        },
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.pauseTask.mockResolvedValue(true);

      const depsWithMatrix = {
        ...mockDeps,
        matrix: mockMatrixManager,
      };

      const handlerWithMatrix = new ControlSignalHandler(depsWithMatrix);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "pause",
        requestedBy: "user-123",
      };

      await handlerWithMatrix.handleControlSignal(request);

      expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
        "!room123:matrix.org",
        "task-123",
        "Task paused",
        "status_change"
      );
    });
  });

  describe("handleResume", () => {
    it("should resume paused task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "paused",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.resumeTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "resume",
        requestedBy: "user-123",
        reason: "Resuming after review",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: true,
        taskId: "task-123",
        signal: "resume",
        previousStatus: "paused",
        newStatus: "running",
      });
      expect(mockExecution.resumeTask).toHaveBeenCalledWith("task-123");
      expect(mockRegistry.updateStatus).toHaveBeenCalledWith("task-123", "running");
    });

    it("should not resume running task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "resume",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: false,
        taskId: "task-123",
        signal: "resume",
        previousStatus: "running",
        error: "Cannot resume task with status: running",
      });
      expect(mockExecution.resumeTask).not.toHaveBeenCalled();
    });

    it("should not resume completed task", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "completed",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "resume",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Cannot resume task with status: completed");
    });

    it("should return error if resume fails", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "paused",
        createdAt: Date.now(),
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.resumeTask.mockResolvedValue(false);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "resume",
        requestedBy: "user-123",
      };

      const result = await handler.handleControlSignal(request);

      expect(result).toEqual({
        success: false,
        taskId: "task-123",
        signal: "resume",
        previousStatus: "paused",
        error: "Failed to resume task execution",
      });
      expect(mockRegistry.updateStatus).not.toHaveBeenCalled();
    });

    it("should update workspace with resume event", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "paused",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.resumeTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "resume",
        requestedBy: "user-123",
        reason: "Resume after review",
      };

      await handler.handleControlSignal(request);

      expect(mockWorkspace.updateWorkspace).toHaveBeenCalledWith(
        "agent-456",
        "block-789",
        {
          status: "running",
          events: [
            {
              timestamp: expect.any(Number),
              type: "task_resumed",
              message: "Resume after review",
              data: { requested_by: "user-123" },
            },
          ],
        }
      );
    });

    it("should notify Matrix when resuming", async () => {
      const mockMatrixManager = {
        sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MatrixRoomManager>;

      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "paused",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
        matrixRoom: {
          roomId: "!room123:matrix.org",
          createdAt: 1000,
        },
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.resumeTask.mockResolvedValue(true);

      const depsWithMatrix = {
        ...mockDeps,
        matrix: mockMatrixManager,
      };

      const handlerWithMatrix = new ControlSignalHandler(depsWithMatrix);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "resume",
        requestedBy: "user-123",
      };

      await handlerWithMatrix.handleControlSignal(request);

      expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
        "!room123:matrix.org",
        "task-123",
        "Task resumed",
        "status_change"
      );
    });
  });

  describe("updateWorkspace", () => {
    it("should skip update when task has no workspace block", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: undefined,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      await handler.handleControlSignal(request);

      expect(mockWorkspace.updateWorkspace).not.toHaveBeenCalled();
    });
  });

  describe("notifyMatrix", () => {
    it("should skip notification when Matrix not available", async () => {
      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
        matrixRoom: {
          roomId: "!room123:matrix.org",
          createdAt: 1000,
        },
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      await handler.handleControlSignal(request);

      // Should succeed even without Matrix
      expect(mockRegistry.updateStatus).toHaveBeenCalled();
    });

    it("should skip notification when task has no Matrix room", async () => {
      const mockMatrixManager = {
        sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<MatrixRoomManager>;

      const mockTask = {
        taskId: "task-123",
        agentId: "agent-456",
        status: "running",
        createdAt: Date.now(),
        workspaceBlockId: "block-789",
        matrixRoom: undefined,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockExecution.cancelTask.mockResolvedValue(true);

      const depsWithMatrix = {
        ...mockDeps,
        matrix: mockMatrixManager,
      };

      const handlerWithMatrix = new ControlSignalHandler(depsWithMatrix);

      const request: ControlSignalRequest = {
        taskId: "task-123",
        signal: "cancel",
        requestedBy: "user-123",
      };

      await handlerWithMatrix.handleControlSignal(request);

      expect(mockMatrixManager.sendTaskUpdate).not.toHaveBeenCalled();
    });
  });
});
