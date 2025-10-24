import {
  getTaskHistory,
  archiveTaskConversation,
  type GetTaskHistoryParams,
  type ArchiveTaskConversationParams,
  type TaskArchiveDependencies,
} from "../../src/tools/task-archive-tools.js";
import type { TaskRegistry } from "../../src/task-registry.js";
import type { WorkspaceManager } from "../../src/workspace-manager.js";
import type { MatrixRoomManager } from "../../src/matrix-room-manager.js";
import type { WorkspaceBlock } from "../../src/types/workspace.js";

describe("task-archive-tools", () => {
  let mockDeps: jest.Mocked<TaskArchiveDependencies>;
  let mockRegistry: jest.Mocked<TaskRegistry>;
  let mockWorkspace: jest.Mocked<WorkspaceManager>;
  let mockMatrix: jest.Mocked<MatrixRoomManager> | null;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRegistry = {
      getTask: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockWorkspace = {
      getWorkspace: jest.fn(),
      appendEvent: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceManager>;

    mockMatrix = null;

    mockDeps = {
      registry: mockRegistry,
      workspace: mockWorkspace,
      matrix: mockMatrix,
    };
  });

  describe("getTaskHistory", () => {
    describe("Task validation", () => {
      it("should throw error when task not found", async () => {
        mockRegistry.getTask.mockReturnValue(undefined);

        const params: GetTaskHistoryParams = {
          task_id: "nonexistent-task",
          include_artifacts: false,
        };

        await expect(getTaskHistory(params, mockDeps)).rejects.toThrow(
          "Task nonexistent-task not found"
        );
      });

      it("should throw error when task has no workspace block", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          workspaceBlockId: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: GetTaskHistoryParams = {
          task_id: "task-123",
          include_artifacts: false,
        };

        await expect(getTaskHistory(params, mockDeps)).rejects.toThrow(
          "Task task-123 does not have a workspace block"
        );
      });
    });

    describe("History retrieval", () => {
      it("should return task history with events", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          completedAt: 2000,
          workspaceBlockId: "block-789",
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "completed",
          created_at: 1000,
          updated_at: 2000,
          events: [
            {
              timestamp: 1100,
              type: "task_started",
              message: "Task started",
            },
            {
              timestamp: 1500,
              type: "task_progress",
              message: "Progress 50%",
            },
            {
              timestamp: 2000,
              type: "task_completed",
              message: "Task completed",
            },
          ],
          artifacts: [],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const params: GetTaskHistoryParams = {
          task_id: "task-123",
          include_artifacts: false,
        };

        const result = await getTaskHistory(params, mockDeps);

        expect(result).toEqual({
          task_id: "task-123",
          status: "completed",
          created_at: 1000,
          completed_at: 2000,
          events: [
            {
              timestamp: 1100,
              type: "task_started",
              message: "Task started",
            },
            {
              timestamp: 1500,
              type: "task_progress",
              message: "Progress 50%",
            },
            {
              timestamp: 2000,
              type: "task_completed",
              message: "Task completed",
            },
          ],
        });
        expect(result.artifacts).toBeUndefined();
      });

      it("should include artifacts when include_artifacts is true", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          completedAt: 2000,
          workspaceBlockId: "block-789",
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "completed",
          created_at: 1000,
          updated_at: 2000,
          events: [],
          artifacts: [
            {
              timestamp: 1500,
              type: "file",
              name: "output.txt",
              content: "Task output content",
            },
            {
              timestamp: 1800,
              type: "file",
              name: "result.json",
              content: '{"result": "success"}',
            },
          ],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const params: GetTaskHistoryParams = {
          task_id: "task-123",
          include_artifacts: true,
        };

        const result = await getTaskHistory(params, mockDeps);

        expect(result.artifacts).toEqual([
          {
            timestamp: 1500,
            type: "file",
            name: "output.txt",
            content: "Task output content",
          },
          {
            timestamp: 1800,
            type: "file",
            name: "result.json",
            content: '{"result": "success"}',
          },
        ]);
      });

      it("should handle running tasks without completed_at", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: 1000,
          completedAt: undefined,
          workspaceBlockId: "block-789",
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "running",
          created_at: 1000,
          updated_at: 1500,
          events: [
            {
              timestamp: 1100,
              type: "task_started",
              message: "Task started",
            },
          ],
          artifacts: [],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const params: GetTaskHistoryParams = {
          task_id: "task-123",
          include_artifacts: false,
        };

        const result = await getTaskHistory(params, mockDeps);

        expect(result.completed_at).toBeUndefined();
        expect(result.status).toBe("running");
      });

      it("should filter out event data field", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          workspaceBlockId: "block-789",
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "completed",
          created_at: 1000,
          updated_at: 2000,
          events: [
            {
              timestamp: 1100,
              type: "task_started",
              message: "Task started",
              data: { extraInfo: "should not be included" },
            },
          ],
          artifacts: [],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const params: GetTaskHistoryParams = {
          task_id: "task-123",
          include_artifacts: false,
        };

        const result = await getTaskHistory(params, mockDeps);

        expect(result.events[0]).toEqual({
          timestamp: 1100,
          type: "task_started",
          message: "Task started",
        });
        expect(result.events[0]).not.toHaveProperty("data");
      });
    });
  });

  describe("archiveTaskConversation", () => {
    describe("Task validation", () => {
      it("should throw error when task not found", async () => {
        mockRegistry.getTask.mockReturnValue(undefined);

        const params: ArchiveTaskConversationParams = {
          task_id: "nonexistent-task",
        };

        await expect(archiveTaskConversation(params, mockDeps)).rejects.toThrow(
          "Task nonexistent-task not found"
        );
      });

      it("should throw error when task has no matrix room", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          matrixRoom: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        await expect(archiveTaskConversation(params, mockDeps)).rejects.toThrow(
          "Task task-123 does not have a communication channel to archive"
        );
      });

      it("should throw error when task is running", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "running",
          createdAt: 1000,
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        await expect(archiveTaskConversation(params, mockDeps)).rejects.toThrow(
          "Cannot archive task with status: running. Task must be completed, failed, or cancelled."
        );
      });

      it("should throw error when task is queued", async () => {
        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "queued",
          createdAt: 1000,
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        await expect(archiveTaskConversation(params, mockDeps)).rejects.toThrow(
          "Cannot archive task with status: queued"
        );
      });
    });

    describe("Archive operations", () => {
      it("should archive completed task conversation", async () => {
        const mockMatrixManager = {
          archiveTaskRoom: jest.fn().mockResolvedValue({
            archivedAt: 3000,
            messageCount: 5,
          }),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          completedAt: 2000,
          workspaceBlockId: "block-789",
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "completed",
          created_at: 1000,
          updated_at: 2000,
          events: [
            { timestamp: 1100, type: "task_started", message: "Started" },
            { timestamp: 1500, type: "task_progress", message: "Progress" },
            { timestamp: 2000, type: "task_completed", message: "Completed" },
          ],
          artifacts: [
            {
              timestamp: 1800,
              type: "file",
              name: "output.txt",
              content: "Output",
            },
          ],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
          summary: "Task completed successfully",
        };

        const result = await archiveTaskConversation(params, depsWithMatrix);

        expect(mockMatrixManager.archiveTaskRoom).toHaveBeenCalledWith(
          "!room123:matrix.org",
          "task-123"
        );
        expect(mockWorkspace.appendEvent).toHaveBeenCalledWith(
          "agent-456",
          "block-789",
          {
            timestamp: expect.any(Number),
            type: "task_message",
            message: "Task completed successfully",
            data: {
              archived_at: 3000,
              message_count: 3,
              artifact_count: 1,
            },
          }
        );
        expect(result).toEqual({
          task_id: "task-123",
          archived_at: 3000,
          archive_location: "block-789",
          message_count: 3,
        });
      });

      it("should archive failed task conversation", async () => {
        const mockMatrixManager = {
          archiveTaskRoom: jest.fn().mockResolvedValue({
            archivedAt: 3000,
            messageCount: 2,
          }),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "failed",
          createdAt: 1000,
          completedAt: 1500,
          workspaceBlockId: "block-789",
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "failed",
          created_at: 1000,
          updated_at: 1500,
          events: [
            { timestamp: 1100, type: "task_started", message: "Started" },
            { timestamp: 1500, type: "task_failed", message: "Failed" },
          ],
          artifacts: [],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        const result = await archiveTaskConversation(params, depsWithMatrix);

        expect(result.task_id).toBe("task-123");
        expect(mockWorkspace.appendEvent).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            message: "Task conversation archived",
          })
        );
      });

      it("should archive cancelled task conversation", async () => {
        const mockMatrixManager = {
          archiveTaskRoom: jest.fn().mockResolvedValue({
            archivedAt: 3000,
            messageCount: 1,
          }),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "cancelled",
          createdAt: 1000,
          completedAt: 1200,
          workspaceBlockId: "block-789",
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "cancelled",
          created_at: 1000,
          updated_at: 1200,
          events: [
            { timestamp: 1100, type: "task_started", message: "Started" },
          ],
          artifacts: [],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        const result = await archiveTaskConversation(params, depsWithMatrix);

        expect(result.task_id).toBe("task-123");
      });

      it("should use default summary when not provided", async () => {
        const mockMatrixManager = {
          archiveTaskRoom: jest.fn().mockResolvedValue({
            archivedAt: 3000,
            messageCount: 1,
          }),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          completedAt: 2000,
          workspaceBlockId: "block-789",
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "completed",
          created_at: 1000,
          updated_at: 2000,
          events: [{ timestamp: 1100, type: "task_started", message: "Started" }],
          artifacts: [],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        await archiveTaskConversation(params, depsWithMatrix);

        expect(mockWorkspace.appendEvent).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            message: "Task conversation archived",
          })
        );
      });

      it("should handle task without workspace block", async () => {
        const mockMatrixManager = {
          archiveTaskRoom: jest.fn().mockResolvedValue({
            archivedAt: 3000,
            messageCount: 1,
          }),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          completedAt: 2000,
          workspaceBlockId: undefined,
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        await expect(archiveTaskConversation(params, depsWithMatrix)).rejects.toThrow(
          "Task task-123 does not have a workspace block"
        );
      });

      it("should throw error when archive operation fails", async () => {
        const mockMatrixManager = {
          archiveTaskRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          completedAt: 2000,
          workspaceBlockId: "block-789",
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        await expect(archiveTaskConversation(params, depsWithMatrix)).rejects.toThrow(
          "Failed to archive task conversation"
        );
      });

      it("should handle zero artifacts correctly", async () => {
        const mockMatrixManager = {
          archiveTaskRoom: jest.fn().mockResolvedValue({
            archivedAt: 3000,
            messageCount: 2,
          }),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: "task-123",
          agentId: "agent-456",
          status: "completed",
          createdAt: 1000,
          completedAt: 2000,
          workspaceBlockId: "block-789",
          matrixRoom: {
            roomId: "!room123:matrix.org",
            createdAt: 1000,
          },
        };

        const mockWorkspaceBlock: WorkspaceBlock = {
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "completed",
          created_at: 1000,
          updated_at: 2000,
          events: [
            { timestamp: 1100, type: "task_started", message: "Started" },
            { timestamp: 2000, type: "task_completed", message: "Completed" },
          ],
          artifacts: [],
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ArchiveTaskConversationParams = {
          task_id: "task-123",
        };

        await archiveTaskConversation(params, depsWithMatrix);

        expect(mockWorkspace.appendEvent).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            data: expect.objectContaining({
              artifact_count: 0,
            }),
          })
        );
      });
    });
  });
});
