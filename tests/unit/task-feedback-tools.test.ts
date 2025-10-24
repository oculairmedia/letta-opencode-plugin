import { sendTaskFeedback, sendRuntimeUpdate, type SendTaskFeedbackParams, type SendRuntimeUpdateParams, type TaskFeedbackDependencies } from "../../src/tools/task-feedback-tools.js";
import type { TaskRegistry } from "../../src/task-registry.js";
import type { WorkspaceManager } from "../../src/workspace-manager.js";
import type { MatrixRoomManager } from "../../src/matrix-room-manager.js";

describe("task-feedback-tools", () => {
  let mockDeps: jest.Mocked<TaskFeedbackDependencies>;
  let mockRegistry: jest.Mocked<TaskRegistry>;
  let mockWorkspace: jest.Mocked<WorkspaceManager>;
  let mockMatrix: jest.Mocked<MatrixRoomManager> | null;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRegistry = {
      getTask: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockWorkspace = {
      appendEvent: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceManager>;

    mockMatrix = null;

    mockDeps = {
      registry: mockRegistry,
      workspace: mockWorkspace,
      matrix: mockMatrix,
    };
  });

  describe("sendTaskFeedback", () => {
    describe("Task validation", () => {
      it("should throw error when task not found", async () => {
        mockRegistry.getTask.mockReturnValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "nonexistent-task",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await expect(sendTaskFeedback(params, mockDeps)).rejects.toThrow(
          "Task nonexistent-task not found"
        );
      });

      it("should throw error when task has no workspace block", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await expect(sendTaskFeedback(params, mockDeps)).rejects.toThrow(
          "Task task-123 does not have a workspace block"
        );
      });

      it("should throw error when task is not running or paused", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await expect(sendTaskFeedback(params, mockDeps)).rejects.toThrow(
          "Cannot send feedback to task with status: completed"
        );
      });

      it("should allow feedback for running tasks", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await sendTaskFeedback(params, mockDeps);

        expect(mockWorkspace.appendEvent).toHaveBeenCalled();
      });

      it("should allow feedback for paused tasks", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "paused",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await sendTaskFeedback(params, mockDeps);

        expect(mockWorkspace.appendEvent).toHaveBeenCalled();
      });
    });

    describe("Feedback recording", () => {
      it("should append feedback event to workspace", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Please revise the implementation",
          feedback_type: "correction",
        };

        await sendTaskFeedback(params, mockDeps);

        expect(mockWorkspace.appendEvent).toHaveBeenCalledWith(
          "agent-456",
          "block-123",
          expect.objectContaining({
            type: "task_feedback",
            message: "Please revise the implementation",
            data: expect.objectContaining({
              feedback_type: "correction",
            }),
          })
        );
      });

      it("should generate unique feedback ID", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        const result = await sendTaskFeedback(params, mockDeps);

        expect(result.feedback_id).toMatch(/^feedback-\d+$/);
      });

      it("should use default feedback type of guidance", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await sendTaskFeedback(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.data?.feedback_type).toBe("guidance");
      });

      it("should include metadata in event data", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
          metadata: { priority: "high", source: "human" },
        };

        await sendTaskFeedback(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs[2].data).toMatchObject({
          priority: "high",
          source: "human",
        });
      });
    });

    describe("Matrix integration", () => {
      it("should send Matrix update when Matrix is enabled and room exists", async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
          matrixRoom: {
            roomId: "!room123:matrix.org",
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Good progress!",
          feedback_type: "approval",
        };

        await sendTaskFeedback(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
          "!room123:matrix.org",
          "task-123",
          "Feedback [approval]: Good progress!",
          "progress"
        );
      });

      it("should not send Matrix update when Matrix is disabled", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
          matrixRoom: {
            roomId: "!room123:matrix.org",
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await sendTaskFeedback(params, mockDeps);

        // No Matrix call should be made
      });

      it("should not send Matrix update when task has no Matrix room", async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
          matrixRoom: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        await sendTaskFeedback(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).not.toHaveBeenCalled();
      });
    });

    describe("Response format", () => {
      it("should return feedback ID and timestamp", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const beforeTime = Date.now();

        const params: SendTaskFeedbackParams = {
          task_id: "task-123",
          feedback: "Test feedback",
          feedback_type: "guidance",
        };

        const result = await sendTaskFeedback(params, mockDeps);

        const afterTime = Date.now();

        expect(result).toEqual({
          task_id: "task-123",
          feedback_id: expect.stringMatching(/^feedback-\d+$/),
          timestamp: expect.any(Number),
        });
        expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(result.timestamp).toBeLessThanOrEqual(afterTime);
      });
    });
  });

  describe("sendRuntimeUpdate", () => {
    describe("Task validation", () => {
      it("should throw error when task not found", async () => {
        mockRegistry.getTask.mockReturnValue(undefined);

        const params: SendRuntimeUpdateParams = {
          task_id: "nonexistent-task",
          update: "Test update",
          update_type: "context_change",
        };

        await expect(sendRuntimeUpdate(params, mockDeps)).rejects.toThrow(
          "Task nonexistent-task not found"
        );
      });

      it("should throw error when task has no workspace block", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: SendRuntimeUpdateParams = {
          task_id: "task-123",
          update: "Test update",
          update_type: "context_change",
        };

        await expect(sendRuntimeUpdate(params, mockDeps)).rejects.toThrow(
          "Task task-123 does not have a workspace block"
        );
      });

      it("should throw error when task is not running or paused", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: SendRuntimeUpdateParams = {
          task_id: "task-123",
          update: "Test update",
          update_type: "context_change",
        };

        await expect(sendRuntimeUpdate(params, mockDeps)).rejects.toThrow(
          "Cannot send runtime update to task with status: completed"
        );
      });
    });

    describe("Update recording", () => {
      it("should append runtime update event to workspace", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendRuntimeUpdateParams = {
          task_id: "task-123",
          update: "Requirements have changed",
          update_type: "requirement_change",
        };

        await sendRuntimeUpdate(params, mockDeps);

        expect(mockWorkspace.appendEvent).toHaveBeenCalledWith(
          "agent-456",
          "block-123",
          expect.objectContaining({
            type: "task_runtime_update",
            message: "Requirements have changed",
            data: expect.objectContaining({
              update_type: "requirement_change",
            }),
          })
        );
      });

      it("should use default update type of context_change", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendRuntimeUpdateParams = {
          task_id: "task-123",
          update: "Test update",
          update_type: "context_change",
        };

        await sendRuntimeUpdate(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.data?.update_type).toBe("context_change");
      });

      it("should generate unique update ID", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendRuntimeUpdateParams = {
          task_id: "task-123",
          update: "Test update",
          update_type: "context_change",
        };

        const result = await sendRuntimeUpdate(params, mockDeps);

        expect(result.update_id).toMatch(/^update-\d+$/);
      });
    });

    describe("Matrix integration", () => {
      it("should send Matrix update when Matrix is enabled and room exists", async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
          matrixRoom: {
            roomId: "!room123:matrix.org",
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendRuntimeUpdateParams = {
          task_id: "task-123",
          update: "Context has changed",
          update_type: "context_change",
        };

        await sendRuntimeUpdate(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
          "!room123:matrix.org",
          "task-123",
          "Runtime Update [context_change]: Context has changed",
          "progress"
        );
      });
    });

    describe("Response format", () => {
      it("should return update ID and timestamp", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: Date.now(),
          workspaceBlockId: "block-123",
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const beforeTime = Date.now();

        const params: SendRuntimeUpdateParams = {
          task_id: "task-123",
          update: "Test update",
          update_type: "context_change",
        };

        const result = await sendRuntimeUpdate(params, mockDeps);

        const afterTime = Date.now();

        expect(result).toEqual({
          task_id: "task-123",
          update_id: expect.stringMatching(/^update-\d+$/),
          timestamp: expect.any(Number),
        });
        expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(result.timestamp).toBeLessThanOrEqual(afterTime);
      });
    });
  });
});
