import {
  getTaskStatus,
  type GetTaskStatusParams,
  type TaskStatusDependencies,
} from '../../src/tools/task-status-tools.js';
import type { TaskRegistry } from '../../src/task-registry.js';
import type { WorkspaceManager } from '../../src/workspace-manager.js';
import type { WorkspaceBlock } from '../../src/types/workspace.js';

describe('getTaskStatus', () => {
  let mockDeps: jest.Mocked<TaskStatusDependencies>;
  let mockRegistry: jest.Mocked<TaskRegistry>;
  let mockWorkspace: jest.Mocked<WorkspaceManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRegistry = {
      getTask: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockWorkspace = {
      getWorkspace: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceManager>;

    mockDeps = {
      registry: mockRegistry,
      workspace: mockWorkspace,
    };
  });

  describe('Task retrieval', () => {
    it('should throw error when task not found', async () => {
      mockRegistry.getTask.mockReturnValue(undefined);

      const params: GetTaskStatusParams = {
        task_id: 'nonexistent-task',
      };

      await expect(getTaskStatus(params, mockDeps)).rejects.toThrow(
        'Task nonexistent-task not found'
      );
    });

    it('should return task status when task exists', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'running',
        createdAt: 1000,
        startedAt: 1500,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result).toEqual({
        task_id: 'task-123',
        status: 'running',
        created_at: 1000,
        started_at: 1500,
        completed_at: undefined,
        agent_id: 'agent-456',
        workspace_block_id: undefined,
        recent_events: [],
      });
    });

    it('should include completed_at when task is completed', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'completed',
        createdAt: 1000,
        startedAt: 1500,
        completedAt: 2000,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.completed_at).toBe(2000);
    });

    it('should include workspace_block_id when available', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'running',
        createdAt: 1000,
        workspaceBlockId: 'block-789',
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.workspace_block_id).toBe('block-789');
    });
  });

  describe('Workspace events', () => {
    it('should fetch and include recent events from workspace', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'running',
        createdAt: 1000,
        workspaceBlockId: 'block-789',
      };

      const mockWorkspaceBlock: WorkspaceBlock = {
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-456',
        status: 'running',
        created_at: 1000,
        updated_at: 2000,
        events: [
          {
            timestamp: 1100,
            type: 'task_started',
            message: 'Task started',
          },
          {
            timestamp: 1200,
            type: 'task_progress',
            message: 'Progress 25%',
          },
          {
            timestamp: 1300,
            type: 'task_progress',
            message: 'Progress 50%',
          },
        ],
        artifacts: [],
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.recent_events).toEqual([
        {
          timestamp: 1100,
          type: 'task_started',
          message: 'Task started',
        },
        {
          timestamp: 1200,
          type: 'task_progress',
          message: 'Progress 25%',
        },
        {
          timestamp: 1300,
          type: 'task_progress',
          message: 'Progress 50%',
        },
      ]);
    });

    it('should limit recent events to last 5', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'running',
        createdAt: 1000,
        workspaceBlockId: 'block-789',
      };

      const mockWorkspaceBlock: WorkspaceBlock = {
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-456',
        status: 'running',
        created_at: 1000,
        updated_at: 2000,
        events: Array.from({ length: 10 }, (_, i) => ({
          timestamp: 1000 + i * 100,
          type: 'task_progress',
          message: `Event ${i}`,
        })),
        artifacts: [],
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.recent_events).toHaveLength(5);
      expect(result.recent_events[0].message).toBe('Event 5');
      expect(result.recent_events[4].message).toBe('Event 9');
    });

    it('should handle workspace fetch errors gracefully', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'running',
        createdAt: 1000,
        workspaceBlockId: 'block-789',
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockWorkspace.getWorkspace.mockRejectedValue(new Error('Workspace not found'));

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.recent_events).toEqual([]);
      expect(result.task_id).toBe('task-123');
    });

    it('should not fetch workspace when no workspace_block_id', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'queued',
        createdAt: 1000,
        workspaceBlockId: undefined,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(mockWorkspace.getWorkspace).not.toHaveBeenCalled();
      expect(result.recent_events).toEqual([]);
    });

    it('should omit event data field from recent events', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'running',
        createdAt: 1000,
        workspaceBlockId: 'block-789',
      };

      const mockWorkspaceBlock: WorkspaceBlock = {
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-456',
        status: 'running',
        created_at: 1000,
        updated_at: 2000,
        events: [
          {
            timestamp: 1100,
            type: 'task_started',
            message: 'Task started',
            data: { someData: 'value' },
          },
        ],
        artifacts: [],
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);
      mockWorkspace.getWorkspace.mockResolvedValue(mockWorkspaceBlock);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.recent_events[0]).toEqual({
        timestamp: 1100,
        type: 'task_started',
        message: 'Task started',
      });
      expect(result.recent_events[0]).not.toHaveProperty('data');
    });
  });

  describe('Different task statuses', () => {
    it('should handle queued tasks', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'queued',
        createdAt: 1000,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.status).toBe('queued');
      expect(result.started_at).toBeUndefined();
      expect(result.completed_at).toBeUndefined();
    });

    it('should handle running tasks', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'running',
        createdAt: 1000,
        startedAt: 1500,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.status).toBe('running');
      expect(result.started_at).toBe(1500);
      expect(result.completed_at).toBeUndefined();
    });

    it('should handle completed tasks', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'completed',
        createdAt: 1000,
        startedAt: 1500,
        completedAt: 2000,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.status).toBe('completed');
      expect(result.started_at).toBe(1500);
      expect(result.completed_at).toBe(2000);
    });

    it('should handle failed tasks', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'failed',
        createdAt: 1000,
        startedAt: 1500,
        completedAt: 1800,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.status).toBe('failed');
      expect(result.completed_at).toBe(1800);
    });

    it('should handle timeout tasks', async () => {
      const mockTask = {
        taskId: 'task-123',
        agentId: 'agent-456',
        status: 'timeout',
        createdAt: 1000,
        startedAt: 1500,
        completedAt: 3500,
      };

      mockRegistry.getTask.mockReturnValue(mockTask as any);

      const params: GetTaskStatusParams = {
        task_id: 'task-123',
      };

      const result = await getTaskStatus(params, mockDeps);

      expect(result.status).toBe('timeout');
      expect(result.completed_at).toBe(3500);
    });
  });
});
