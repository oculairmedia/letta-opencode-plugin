import {
  executeTask,
  type ExecuteTaskParams,
  type ExecuteTaskDependencies,
} from '../../src/tools/execute-task.js';
import type { LettaClient } from '../../src/letta-client.js';
import type { WorkspaceManager } from '../../src/workspace-manager.js';
import type { ExecutionManager } from '../../src/execution-manager.js';
import type { TaskRegistry } from '../../src/task-registry.js';
import type { MatrixRoomManager } from '../../src/matrix-room-manager.js';

describe('executeTask', () => {
  let mockDeps: jest.Mocked<ExecuteTaskDependencies>;
  let mockLetta: jest.Mocked<LettaClient>;
  let mockWorkspace: jest.Mocked<WorkspaceManager>;
  let mockExecution: jest.Mocked<ExecutionManager>;
  let mockRegistry: jest.Mocked<TaskRegistry>;
  let mockMatrix: jest.Mocked<MatrixRoomManager> | null;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLetta = {} as jest.Mocked<LettaClient>;

    mockWorkspace = {
      createWorkspaceBlock: jest.fn(),
      updateWorkspace: jest.fn(),
      detachWorkspaceBlock: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceManager>;

    mockExecution = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ExecutionManager>;

    mockRegistry = {
      canAcceptTask: jest.fn(),
      register: jest.fn(),
      updateStatus: jest.fn(),
      updateMatrixRoom: jest.fn(),
      clearMatrixRoom: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockMatrix = null;

    mockDeps = {
      letta: mockLetta,
      workspace: mockWorkspace,
      execution: mockExecution,
      registry: mockRegistry,
      matrix: mockMatrix,
    };
  });

  describe('Queue management', () => {
    it('should reject task when queue is full', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(false);

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: false,
      };

      const result = await executeTask(params, mockDeps);

      expect(result).toEqual({
        error: 'Task queue full',
        code: 'QUEUE_FULL',
        status: 429,
      });
      expect(mockRegistry.canAcceptTask).toHaveBeenCalled();
      expect(mockRegistry.register).not.toHaveBeenCalled();
    });

    it('should accept task when queue has capacity', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: expect.any(String),
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: false,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('queued');
      expect(result.task_id).toBeDefined();
      expect(mockRegistry.canAcceptTask).toHaveBeenCalled();
      expect(mockRegistry.register).toHaveBeenCalled();
    });
  });

  describe('Idempotency', () => {
    it('should return existing task when idempotency key matches', async () => {
      const existingTaskId = 'existing-task-123';

      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockReturnValue({
        taskId: existingTaskId,
        agentId: 'agent-123',
        status: 'running',
        workspaceBlockId: 'existing-block-123',
        createdAt: Date.now(),
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        idempotency_key: 'unique-key-123',
        sync: false,
      };

      const result = await executeTask(params, mockDeps);

      expect(result).toEqual({
        task_id: existingTaskId,
        status: 'running',
        message: 'Task already exists (idempotency key match)',
        workspace_block_id: 'existing-block-123',
      });
      expect(mockWorkspace.createWorkspaceBlock).not.toHaveBeenCalled();
    });

    it('should create new task when idempotency key is different', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        idempotency_key: 'unique-key-456',
        sync: false,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('queued');
      expect(mockWorkspace.createWorkspaceBlock).toHaveBeenCalled();
    });
  });

  describe('Workspace creation', () => {
    it('should create workspace block with correct metadata', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
          metadata: {
            task_description: 'Test task',
            idempotency_key: 'key-123',
          },
        },
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        idempotency_key: 'key-123',
        sync: false,
      };

      await executeTask(params, mockDeps);

      expect(mockWorkspace.createWorkspaceBlock).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: 'agent-123',
          metadata: {
            task_description: 'Test task',
            idempotency_key: 'key-123',
          },
        })
      );
    });

    it('should update registry with workspace block ID', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-456',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: false,
      };

      await executeTask(params, mockDeps);

      expect(mockRegistry.updateStatus).toHaveBeenCalledWith(expect.any(String), 'queued', {
        workspaceBlockId: 'block-456',
      });
    });
  });

  describe('Async execution', () => {
    it('should return immediately for async tasks', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: false,
      };

      const result = await executeTask(params, mockDeps);

      expect(result).toEqual({
        task_id: expect.any(String),
        status: 'queued',
        workspace_block_id: 'block-123',
        message: 'Task queued for execution',
      });
    });

    it('should handle async execution errors gracefully', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });

      mockWorkspace.updateWorkspace.mockRejectedValue(new Error('Workspace update failed'));

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: false,
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('queued');

      // Allow async execution to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      consoleSpy.mockRestore();
    });
  });

  describe('Sync execution', () => {
    it('should wait for task completion in sync mode', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-123',
        status: 'completed',
        created_at: Date.now(),
        updated_at: Date.now(),
        events: [],
        artifacts: [],
      });
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Task completed successfully',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('completed');
      expect(result.task_id).toBeDefined();
      expect(result.exit_code).toBe(0);
      expect(result.duration_ms).toBe(1000);
      expect(mockExecution.execute).toHaveBeenCalled();
    });

    it('should handle execution timeout in sync mode', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-123',
        status: 'timeout',
        created_at: Date.now(),
        updated_at: Date.now(),
        events: [],
        artifacts: [],
      });
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'timeout',
        exitCode: 124,
        output: 'Task timed out',
        startedAt: Date.now(),
        completedAt: Date.now() + 5000,
        durationMs: 5000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
        timeout_ms: 5000,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('timeout');
      expect(mockRegistry.updateStatus).toHaveBeenCalledWith(expect.any(String), 'timeout');
    });

    it('should handle execution failure in sync mode', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-123',
        status: 'failed',
        created_at: Date.now(),
        updated_at: Date.now(),
        events: [],
        artifacts: [],
      });
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'error',
        exitCode: 1,
        output: 'Execution error occurred',
        startedAt: Date.now(),
        completedAt: Date.now() + 500,
        durationMs: 500,
        error: 'Process exited with code 1',
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('failed');
      expect(mockRegistry.updateStatus).toHaveBeenCalledWith(expect.any(String), 'failed');
    });

    it('should handle unexpected errors in sync mode', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-123',
        status: 'failed',
        created_at: Date.now(),
        updated_at: Date.now(),
        events: [],
        artifacts: [],
      });
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockExecution.execute.mockRejectedValue(new Error('Unexpected error'));

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Unexpected error');
    });
  });

  describe('Workspace lifecycle', () => {
    it('should detach workspace block after completion', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-123',
        status: 'completed',
        created_at: Date.now(),
        updated_at: Date.now(),
        events: [],
        artifacts: [],
      });
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Done',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      await executeTask(params, mockDeps);

      expect(mockWorkspace.detachWorkspaceBlock).toHaveBeenCalledWith('agent-123', 'block-123');
    });

    it('should update workspace with final status and artifacts', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-123',
        status: 'completed',
        created_at: Date.now(),
        updated_at: Date.now(),
        events: [],
        artifacts: [],
      });
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Task output',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      await executeTask(params, mockDeps);

      expect(mockWorkspace.updateWorkspace).toHaveBeenCalledWith(
        'agent-123',
        'block-123',
        expect.objectContaining({
          status: 'completed',
          events: expect.arrayContaining([
            expect.objectContaining({
              type: 'task_completed',
            }),
          ]),
          artifacts: expect.arrayContaining([
            expect.objectContaining({
              type: 'output',
              name: 'execution_output',
              content: 'Task output',
            }),
          ]),
        })
      );
    });
  });

  describe('Workspace block creation failure', () => {
    it('should return error when workspace block creation fails', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockRejectedValue(new Error('Failed to create block'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: false,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Failed to create workspace block');

      consoleSpy.mockRestore();
    });
  });

  describe('Matrix room integration', () => {
    let mockMatrixManager: jest.Mocked<MatrixRoomManager>;

    beforeEach(() => {
      mockMatrixManager = {
        createTaskRoom: jest.fn(),
        sendTaskUpdate: jest.fn(),
        closeTaskRoom: jest.fn(),
      } as unknown as jest.Mocked<MatrixRoomManager>;

      mockLetta = {
        sendMessage: jest.fn(),
      } as unknown as jest.Mocked<LettaClient>;

      mockDeps.matrix = mockMatrixManager;
      mockDeps.letta = mockLetta;
    });

    it('should create Matrix room when Matrix is enabled', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockMatrixManager.createTaskRoom.mockResolvedValue({
        roomId: '!room:matrix.org',
        taskId: 'task-123',
        participants: [],
        createdAt: Date.now(),
      });
      mockMatrixManager.closeTaskRoom.mockResolvedValue(undefined);
      mockLetta.sendMessage.mockResolvedValue({} as any);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Done',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
        observers: ['@user:matrix.org'],
      };

      await executeTask(params, mockDeps);

      expect(mockMatrixManager.createTaskRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: expect.any(String),
          taskDescription: 'Test task',
          callingAgentId: 'agent-123',
        })
      );
      expect(mockRegistry.updateMatrixRoom).toHaveBeenCalled();
    });

    it('should handle Matrix room creation failure gracefully', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {} as any,
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockMatrixManager.createTaskRoom.mockRejectedValue(new Error('Matrix error'));
      mockLetta.sendMessage.mockResolvedValue({} as any);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Done',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('completed');
      expect(mockRegistry.updateMatrixRoom).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should send updates to Matrix room during execution', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {} as any,
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockMatrixManager.createTaskRoom.mockResolvedValue({
        roomId: '!room:matrix.org',
        taskId: 'task-123',
        participants: [],
        createdAt: Date.now(),
      });
      mockMatrixManager.sendTaskUpdate.mockResolvedValue(undefined);
      mockMatrixManager.closeTaskRoom.mockResolvedValue(undefined);
      mockLetta.sendMessage.mockResolvedValue({} as any);

      // Capture the event callback and call it
      mockExecution.execute.mockImplementation(async (req, onEvent) => {
        if (onEvent) {
          onEvent({
            type: 'output',
            timestamp: Date.now(),
            data: 'Processing...',
            sessionId: 'session-123',
          });
        }
        return {
          taskId: 'task-123',
          status: 'success',
          exitCode: 0,
          output: 'Done',
          startedAt: Date.now(),
          completedAt: Date.now() + 1000,
          durationMs: 1000,
        };
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      await executeTask(params, mockDeps);

      // Allow async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalled();
    });

    it('should close Matrix room on task completion', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {} as any,
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockMatrixManager.createTaskRoom.mockResolvedValue({
        roomId: '!room:matrix.org',
        taskId: 'task-123',
        participants: [],
        createdAt: Date.now(),
      });
      mockMatrixManager.closeTaskRoom.mockResolvedValue(undefined);
      mockLetta.sendMessage.mockResolvedValue({} as any);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Done',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      await executeTask(params, mockDeps);

      expect(mockMatrixManager.closeTaskRoom).toHaveBeenCalledWith(
        '!room:matrix.org',
        expect.any(String),
        expect.any(String)
      );
      expect(mockRegistry.clearMatrixRoom).toHaveBeenCalled();
    });

    it('should handle Matrix room close failure gracefully', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {} as any,
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockMatrixManager.createTaskRoom.mockResolvedValue({
        roomId: '!room:matrix.org',
        taskId: 'task-123',
        participants: [],
        createdAt: Date.now(),
      });
      mockMatrixManager.closeTaskRoom.mockRejectedValue(new Error('Close failed'));
      mockLetta.sendMessage.mockResolvedValue({} as any);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Done',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('completed');

      consoleSpy.mockRestore();
    });
  });

  describe('Letta notification', () => {
    beforeEach(() => {
      mockLetta = {
        sendMessage: jest.fn(),
      } as unknown as jest.Mocked<LettaClient>;
      mockDeps.letta = mockLetta;
    });

    it('should send completion notification to agent', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {} as any,
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockLetta.sendMessage.mockResolvedValue({} as any);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Done',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      await executeTask(params, mockDeps);

      expect(mockLetta.sendMessage).toHaveBeenCalledWith(
        'agent-123',
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('system_alert'),
        })
      );
    });

    it('should handle notification failure gracefully', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {} as any,
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockLetta.sendMessage.mockRejectedValue(new Error('Notification failed'));
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: 'Done',
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.status).toBe('completed');

      consoleSpy.mockRestore();
    });

    it('should send failure notification when task fails', async () => {
      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {} as any,
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({} as any);
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockLetta.sendMessage.mockResolvedValue({} as any);
      mockExecution.execute.mockRejectedValue(new Error('Execution error'));

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      await executeTask(params, mockDeps);

      expect(mockLetta.sendMessage).toHaveBeenCalledWith(
        'agent-123',
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Failed'),
        })
      );
    });
  });

  describe('Output truncation', () => {
    it('should truncate long output to 5000 characters', async () => {
      const longOutput = 'x'.repeat(10000);

      mockRegistry.canAcceptTask.mockReturnValue(true);
      mockRegistry.register.mockImplementation((taskId) => ({
        taskId,
        agentId: 'agent-123',
        status: 'queued',
        createdAt: Date.now(),
      }));
      mockWorkspace.createWorkspaceBlock.mockResolvedValue({
        blockId: 'block-123',
        workspace: {
          version: '1.0.0',
          task_id: 'task-123',
          agent_id: 'agent-123',
          status: 'pending',
          created_at: Date.now(),
          updated_at: Date.now(),
          events: [],
          artifacts: [],
        },
      });
      mockWorkspace.updateWorkspace.mockResolvedValue({
        version: '1.0.0',
        task_id: 'task-123',
        agent_id: 'agent-123',
        status: 'completed',
        created_at: Date.now(),
        updated_at: Date.now(),
        events: [],
        artifacts: [],
      });
      mockWorkspace.detachWorkspaceBlock.mockResolvedValue(undefined);
      mockExecution.execute.mockResolvedValue({
        taskId: 'task-123',
        status: 'success',
        exitCode: 0,
        output: longOutput,
        startedAt: Date.now(),
        completedAt: Date.now() + 1000,
        durationMs: 1000,
      });

      const params: ExecuteTaskParams = {
        agent_id: 'agent-123',
        task_description: 'Test task',
        sync: true,
      };

      const result = await executeTask(params, mockDeps);

      expect(result.output).toHaveLength(5000);
    });
  });
});
