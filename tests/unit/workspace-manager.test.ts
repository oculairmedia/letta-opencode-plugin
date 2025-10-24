import { WorkspaceManager } from "../../src/workspace-manager.js";
import type { LettaClient } from "../../src/letta-client.js";
import type {
  WorkspaceBlock,
  WorkspaceEvent,
  WorkspaceArtifact,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
} from "../../src/types/workspace.js";

describe("WorkspaceManager", () => {
  let workspaceManager: WorkspaceManager;
  let mockLettaClient: jest.Mocked<LettaClient>;

  beforeEach(() => {
    mockLettaClient = {
      createMemoryBlock: jest.fn(),
      attachMemoryBlock: jest.fn(),
      listMemoryBlocks: jest.fn(),
      updateMemoryBlock: jest.fn(),
      detachMemoryBlock: jest.fn(),
    } as unknown as jest.Mocked<LettaClient>;

    workspaceManager = new WorkspaceManager(mockLettaClient);
  });

  describe("createWorkspaceBlock", () => {
    it("should create a workspace block with correct structure", async () => {
      const request: CreateWorkspaceRequest = {
        task_id: "task-123",
        agent_id: "agent-456",
        metadata: { priority: "high" },
      };

      const mockBlock = { id: "block-789" };
      mockLettaClient.createMemoryBlock.mockResolvedValue(mockBlock as any);
      mockLettaClient.attachMemoryBlock.mockResolvedValue(undefined);

      const result = await workspaceManager.createWorkspaceBlock(request);

      expect(result.blockId).toBe("block-789");
      expect(result.workspace.version).toBe("1.0.0");
      expect(result.workspace.task_id).toBe("task-123");
      expect(result.workspace.agent_id).toBe("agent-456");
      expect(result.workspace.status).toBe("pending");
      expect(result.workspace.events).toEqual([]);
      expect(result.workspace.artifacts).toEqual([]);
      expect(result.workspace.metadata).toEqual({ priority: "high" });
      expect(result.workspace.created_at).toBeGreaterThan(0);
      expect(result.workspace.updated_at).toBeGreaterThan(0);
    });

    it("should call createMemoryBlock with correct parameters", async () => {
      const request: CreateWorkspaceRequest = {
        task_id: "task-123",
        agent_id: "agent-456",
      };

      const mockBlock = { id: "block-789" };
      mockLettaClient.createMemoryBlock.mockResolvedValue(mockBlock as any);
      mockLettaClient.attachMemoryBlock.mockResolvedValue(undefined);

      await workspaceManager.createWorkspaceBlock(request);

      expect(mockLettaClient.createMemoryBlock).toHaveBeenCalledWith(
        "agent-456",
        expect.objectContaining({
          label: "opencode_workspace",
          value: expect.any(String),
        })
      );
    });

    it("should attach the created block to the agent", async () => {
      const request: CreateWorkspaceRequest = {
        task_id: "task-123",
        agent_id: "agent-456",
      };

      const mockBlock = { id: "block-789" };
      mockLettaClient.createMemoryBlock.mockResolvedValue(mockBlock as any);
      mockLettaClient.attachMemoryBlock.mockResolvedValue(undefined);

      await workspaceManager.createWorkspaceBlock(request);

      expect(mockLettaClient.attachMemoryBlock).toHaveBeenCalledWith(
        "agent-456",
        { block_id: "block-789" }
      );
    });

    it("should handle attachment failure gracefully", async () => {
      const request: CreateWorkspaceRequest = {
        task_id: "task-123",
        agent_id: "agent-456",
      };

      const mockBlock = { id: "block-789" };
      mockLettaClient.createMemoryBlock.mockResolvedValue(mockBlock as any);
      mockLettaClient.attachMemoryBlock.mockRejectedValue(
        new Error("Attachment failed")
      );

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await workspaceManager.createWorkspaceBlock(request);

      expect(result.blockId).toBe("block-789");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to attach memory block"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("updateWorkspace", () => {
    const mockExistingBlock = {
      id: "block-789",
      label: "opencode_workspace",
      value: JSON.stringify({
        version: "1.0.0",
        task_id: "task-123",
        agent_id: "agent-456",
        status: "pending",
        created_at: 1000,
        updated_at: 1000,
        events: [],
        artifacts: [],
        metadata: { initial: "data" },
      } as WorkspaceBlock),
    };

    it("should update workspace status", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([
        mockExistingBlock,
      ] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockExistingBlock as any);

      const update: UpdateWorkspaceRequest = {
        status: "running",
      };

      const result = await workspaceManager.updateWorkspace(
        "agent-456",
        "block-789",
        update
      );

      expect(result.status).toBe("running");
      expect(mockLettaClient.updateMemoryBlock).toHaveBeenCalledWith(
        "agent-456",
        "block-789",
        expect.objectContaining({
          value: expect.stringContaining('"status":"running"'),
        })
      );
    });

    it("should append new events to workspace", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([
        mockExistingBlock,
      ] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockExistingBlock as any);

      const newEvent: WorkspaceEvent = {
        timestamp: Date.now(),
        type: "task_started",
        message: "Task has started",
      };

      const update: UpdateWorkspaceRequest = {
        events: [newEvent],
      };

      const result = await workspaceManager.updateWorkspace(
        "agent-456",
        "block-789",
        update
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toEqual(newEvent);
    });

    it("should append new artifacts to workspace", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([
        mockExistingBlock,
      ] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockExistingBlock as any);

      const newArtifact: WorkspaceArtifact = {
        timestamp: Date.now(),
        type: "file",
        name: "output.txt",
        content: "test content",
      };

      const update: UpdateWorkspaceRequest = {
        artifacts: [newArtifact],
      };

      const result = await workspaceManager.updateWorkspace(
        "agent-456",
        "block-789",
        update
      );

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]).toEqual(newArtifact);
    });

    it("should merge metadata updates", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([
        mockExistingBlock,
      ] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockExistingBlock as any);

      const update: UpdateWorkspaceRequest = {
        metadata: { newKey: "newValue" },
      };

      const result = await workspaceManager.updateWorkspace(
        "agent-456",
        "block-789",
        update
      );

      expect(result.metadata).toEqual({
        initial: "data",
        newKey: "newValue",
      });
    });

    it("should update the updated_at timestamp", async () => {
      const beforeUpdate = Date.now();

      mockLettaClient.listMemoryBlocks.mockResolvedValue([
        mockExistingBlock,
      ] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockExistingBlock as any);

      const update: UpdateWorkspaceRequest = {
        status: "running",
      };

      const result = await workspaceManager.updateWorkspace(
        "agent-456",
        "block-789",
        update
      );

      expect(result.updated_at).toBeGreaterThanOrEqual(beforeUpdate);
    });

    it("should throw error when block not found", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([]);

      const update: UpdateWorkspaceRequest = {
        status: "running",
      };

      await expect(
        workspaceManager.updateWorkspace("agent-456", "block-789", update)
      ).rejects.toThrow("Workspace block block-789 not found");
    });

    it("should handle multiple updates simultaneously", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([
        mockExistingBlock,
      ] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockExistingBlock as any);

      const newEvent: WorkspaceEvent = {
        timestamp: Date.now(),
        type: "task_progress",
        message: "Progress update",
      };

      const newArtifact: WorkspaceArtifact = {
        timestamp: Date.now(),
        type: "output",
        name: "result.json",
        content: "{}",
      };

      const update: UpdateWorkspaceRequest = {
        status: "running",
        events: [newEvent],
        artifacts: [newArtifact],
        metadata: { progress: 50 },
      };

      const result = await workspaceManager.updateWorkspace(
        "agent-456",
        "block-789",
        update
      );

      expect(result.status).toBe("running");
      expect(result.events).toHaveLength(1);
      expect(result.artifacts).toHaveLength(1);
      expect(result.metadata).toEqual({
        initial: "data",
        progress: 50,
      });
    });
  });

  describe("appendEvent", () => {
    it("should append a single event to workspace", async () => {
      const mockBlock = {
        id: "block-789",
        label: "opencode_workspace",
        value: JSON.stringify({
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "running",
          created_at: 1000,
          updated_at: 1000,
          events: [],
          artifacts: [],
        } as WorkspaceBlock),
      };

      mockLettaClient.listMemoryBlocks.mockResolvedValue([mockBlock] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockBlock as any);

      const event: WorkspaceEvent = {
        timestamp: Date.now(),
        type: "task_progress",
        message: "50% complete",
        data: { percentage: 50 },
      };

      await workspaceManager.appendEvent("agent-456", "block-789", event);

      expect(mockLettaClient.updateMemoryBlock).toHaveBeenCalledWith(
        "agent-456",
        "block-789",
        expect.objectContaining({
          value: expect.stringContaining("task_progress"),
        })
      );
    });
  });

  describe("recordArtifact", () => {
    it("should record a single artifact to workspace", async () => {
      const mockBlock = {
        id: "block-789",
        label: "opencode_workspace",
        value: JSON.stringify({
          version: "1.0.0",
          task_id: "task-123",
          agent_id: "agent-456",
          status: "running",
          created_at: 1000,
          updated_at: 1000,
          events: [],
          artifacts: [],
        } as WorkspaceBlock),
      };

      mockLettaClient.listMemoryBlocks.mockResolvedValue([mockBlock] as any);
      mockLettaClient.updateMemoryBlock.mockResolvedValue(mockBlock as any);

      const artifact: WorkspaceArtifact = {
        timestamp: Date.now(),
        type: "file",
        name: "test.txt",
        content: "test content",
        metadata: { size: 12 },
      };

      await workspaceManager.recordArtifact("agent-456", "block-789", artifact);

      expect(mockLettaClient.updateMemoryBlock).toHaveBeenCalledWith(
        "agent-456",
        "block-789",
        expect.objectContaining({
          value: expect.stringContaining("test.txt"),
        })
      );
    });
  });

  describe("getWorkspace", () => {
    it("should retrieve workspace by block ID", async () => {
      const workspace: WorkspaceBlock = {
        version: "1.0.0",
        task_id: "task-123",
        agent_id: "agent-456",
        status: "running",
        created_at: 1000,
        updated_at: 2000,
        events: [],
        artifacts: [],
      };

      const mockBlock = {
        id: "block-789",
        label: "opencode_workspace",
        value: JSON.stringify(workspace),
      };

      mockLettaClient.listMemoryBlocks.mockResolvedValue([mockBlock] as any);

      const result = await workspaceManager.getWorkspace(
        "agent-456",
        "block-789"
      );

      expect(result).toEqual(workspace);
    });

    it("should throw error when block not found", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([]);

      await expect(
        workspaceManager.getWorkspace("agent-456", "block-789")
      ).rejects.toThrow("Workspace block block-789 not found");
    });
  });

  describe("findWorkspaceByTaskId", () => {
    it("should find workspace by task ID", async () => {
      const workspace: WorkspaceBlock = {
        version: "1.0.0",
        task_id: "task-123",
        agent_id: "agent-456",
        status: "running",
        created_at: 1000,
        updated_at: 2000,
        events: [],
        artifacts: [],
      };

      const mockBlock = {
        id: "block-789",
        label: "opencode_workspace",
        value: JSON.stringify(workspace),
      };

      mockLettaClient.listMemoryBlocks.mockResolvedValue([mockBlock] as any);

      const result = await workspaceManager.findWorkspaceByTaskId(
        "agent-456",
        "task-123"
      );

      expect(result).not.toBeNull();
      expect(result?.blockId).toBe("block-789");
      expect(result?.workspace).toEqual(workspace);
    });

    it("should return null when task ID not found", async () => {
      const workspace: WorkspaceBlock = {
        version: "1.0.0",
        task_id: "task-456",
        agent_id: "agent-456",
        status: "running",
        created_at: 1000,
        updated_at: 2000,
        events: [],
        artifacts: [],
      };

      const mockBlock = {
        id: "block-789",
        label: "opencode_workspace",
        value: JSON.stringify(workspace),
      };

      mockLettaClient.listMemoryBlocks.mockResolvedValue([mockBlock] as any);

      const result = await workspaceManager.findWorkspaceByTaskId(
        "agent-456",
        "task-123"
      );

      expect(result).toBeNull();
    });

    it("should skip blocks with wrong label", async () => {
      const mockBlocks = [
        {
          id: "block-1",
          label: "different_label",
          value: JSON.stringify({
            version: "1.0.0",
            task_id: "task-123",
            agent_id: "agent-456",
            status: "running",
            created_at: 1000,
            updated_at: 2000,
            events: [],
            artifacts: [],
          } as WorkspaceBlock),
        },
        {
          id: "block-2",
          label: "opencode_workspace",
          value: JSON.stringify({
            version: "1.0.0",
            task_id: "task-123",
            agent_id: "agent-456",
            status: "running",
            created_at: 1000,
            updated_at: 2000,
            events: [],
            artifacts: [],
          } as WorkspaceBlock),
        },
      ];

      mockLettaClient.listMemoryBlocks.mockResolvedValue(mockBlocks as any);

      const result = await workspaceManager.findWorkspaceByTaskId(
        "agent-456",
        "task-123"
      );

      expect(result).not.toBeNull();
      expect(result?.blockId).toBe("block-2");
    });

    it("should handle invalid JSON gracefully", async () => {
      const mockBlocks = [
        {
          id: "block-1",
          label: "opencode_workspace",
          value: "invalid json",
        },
        {
          id: "block-2",
          label: "opencode_workspace",
          value: JSON.stringify({
            version: "1.0.0",
            task_id: "task-123",
            agent_id: "agent-456",
            status: "running",
            created_at: 1000,
            updated_at: 2000,
            events: [],
            artifacts: [],
          } as WorkspaceBlock),
        },
      ];

      mockLettaClient.listMemoryBlocks.mockResolvedValue(mockBlocks as any);

      const result = await workspaceManager.findWorkspaceByTaskId(
        "agent-456",
        "task-123"
      );

      expect(result).not.toBeNull();
      expect(result?.blockId).toBe("block-2");
    });

    it("should return null when no blocks match", async () => {
      mockLettaClient.listMemoryBlocks.mockResolvedValue([]);

      const result = await workspaceManager.findWorkspaceByTaskId(
        "agent-456",
        "task-123"
      );

      expect(result).toBeNull();
    });
  });

  describe("detachWorkspaceBlock", () => {
    it("should detach workspace block from agent", async () => {
      mockLettaClient.detachMemoryBlock.mockResolvedValue(undefined);

      await workspaceManager.detachWorkspaceBlock("agent-456", "block-789");

      expect(mockLettaClient.detachMemoryBlock).toHaveBeenCalledWith(
        "agent-456",
        "block-789"
      );
    });

    it("should handle detachment failure gracefully", async () => {
      mockLettaClient.detachMemoryBlock.mockRejectedValue(
        new Error("Detachment failed")
      );

      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await workspaceManager.detachWorkspaceBlock("agent-456", "block-789");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to detach memory block"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
