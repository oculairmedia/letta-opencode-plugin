import {
  addTaskObserver,
  removeTaskObserver,
  listTaskObservers,
  type AddTaskObserverParams,
  type RemoveTaskObserverParams,
  type ListTaskObserversParams,
  type TaskObserverDependencies,
} from '../../src/tools/task-observer-tools.js';
import type { TaskRegistry } from '../../src/task-registry.js';
import type { MatrixRoomManager } from '../../src/matrix-room-manager.js';

describe('task-observer-tools', () => {
  let mockDeps: jest.Mocked<TaskObserverDependencies>;
  let mockRegistry: jest.Mocked<TaskRegistry>;
  let mockMatrix: jest.Mocked<MatrixRoomManager> | null;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRegistry = {
      getTask: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockMatrix = null;

    mockDeps = {
      registry: mockRegistry,
      matrix: mockMatrix,
    };
  });

  describe('addTaskObserver', () => {
    describe('Coordination validation', () => {
      it('should throw error when Matrix is not enabled', async () => {
        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, mockDeps)).rejects.toThrow(
          'Task coordination is not enabled for this deployment'
        );
      });
    });

    describe('Task validation', () => {
      it('should throw error when task not found', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        mockRegistry.getTask.mockReturnValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'nonexistent-task',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Task nonexistent-task not found'
        );
      });

      it('should throw error when task has no matrix room', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Task task-123 does not have an associated communication channel'
        );
      });

      it('should throw error when task is completed', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'completed',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Cannot add observer to task with status: completed'
        );
      });

      it('should throw error when task is failed', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'failed',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Cannot add observer to task with status: failed'
        );
      });

      it('should throw error when task is cancelled', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'cancelled',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Cannot add observer to task with status: cancelled'
        );
      });

      it('should throw error when observer_id does not start with @', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: 'invalid-id',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Observer ID must be a valid Matrix user ID (starting with @)'
        );
      });
    });

    describe('Observer addition', () => {
      it('should add observer with default values', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        const result = await addTaskObserver(params, depsWithMatrix);

        expect(mockMatrixManager.inviteToRoom).toHaveBeenCalledWith(
          '!room123:matrix.org',
          '@user:matrix.org',
          true
        );
        expect(result).toEqual({
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          channel_id: '!room123:matrix.org',
        });
      });

      it('should add observer with read_only false', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: false,
        };

        await addTaskObserver(params, depsWithMatrix);

        expect(mockMatrixManager.inviteToRoom).toHaveBeenCalledWith(
          '!room123:matrix.org',
          '@user:matrix.org',
          false
        );
      });

      it('should add agent observer', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@agent:matrix.org',
          observer_type: 'agent',
          read_only: true,
        };

        const result = await addTaskObserver(params, depsWithMatrix);

        expect(result.observer_id).toBe('@agent:matrix.org');
        expect(mockMatrixManager.inviteToRoom).toHaveBeenCalled();
      });

      it('should allow adding observer to running task', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).resolves.toBeDefined();
      });

      it('should allow adding observer to queued task', async () => {
        const mockMatrixManager = {
          inviteToRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'queued',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: AddTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          observer_type: 'human',
          read_only: true,
        };

        await expect(addTaskObserver(params, depsWithMatrix)).resolves.toBeDefined();
      });
    });
  });

  describe('removeTaskObserver', () => {
    describe('Coordination validation', () => {
      it('should throw error when Matrix is not enabled', async () => {
        const params: RemoveTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
        };

        await expect(removeTaskObserver(params, mockDeps)).rejects.toThrow(
          'Task coordination is not enabled for this deployment'
        );
      });
    });

    describe('Task validation', () => {
      it('should throw error when task not found', async () => {
        const mockMatrixManager = {
          removeFromRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        mockRegistry.getTask.mockReturnValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: RemoveTaskObserverParams = {
          task_id: 'nonexistent-task',
          observer_id: '@user:matrix.org',
        };

        await expect(removeTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Task nonexistent-task not found'
        );
      });

      it('should throw error when task has no matrix room', async () => {
        const mockMatrixManager = {
          removeFromRoom: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: RemoveTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
        };

        await expect(removeTaskObserver(params, depsWithMatrix)).rejects.toThrow(
          'Task task-123 does not have an associated communication channel'
        );
      });
    });

    describe('Observer removal', () => {
      it('should remove observer from task', async () => {
        const mockMatrixManager = {
          removeFromRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: RemoveTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
        };

        const result = await removeTaskObserver(params, depsWithMatrix);

        expect(mockMatrixManager.removeFromRoom).toHaveBeenCalledWith(
          '!room123:matrix.org',
          '@user:matrix.org'
        );
        expect(result).toEqual({
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
          channel_id: '!room123:matrix.org',
        });
      });

      it('should allow removing observer from completed task', async () => {
        const mockMatrixManager = {
          removeFromRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'completed',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: RemoveTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@user:matrix.org',
        };

        await expect(removeTaskObserver(params, depsWithMatrix)).resolves.toBeDefined();
      });

      it('should handle agent observer removal', async () => {
        const mockMatrixManager = {
          removeFromRoom: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: RemoveTaskObserverParams = {
          task_id: 'task-123',
          observer_id: '@agent:matrix.org',
        };

        const result = await removeTaskObserver(params, depsWithMatrix);

        expect(result.observer_id).toBe('@agent:matrix.org');
      });
    });
  });

  describe('listTaskObservers', () => {
    describe('Coordination validation', () => {
      it('should throw error when Matrix is not enabled', async () => {
        const params: ListTaskObserversParams = {
          task_id: 'task-123',
        };

        await expect(listTaskObservers(params, mockDeps)).rejects.toThrow(
          'Task coordination is not enabled for this deployment'
        );
      });
    });

    describe('Task validation', () => {
      it('should throw error when task not found', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        mockRegistry.getTask.mockReturnValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskObserversParams = {
          task_id: 'nonexistent-task',
        };

        await expect(listTaskObservers(params, depsWithMatrix)).rejects.toThrow(
          'Task nonexistent-task not found'
        );
      });

      it('should throw error when task has no matrix room', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskObserversParams = {
          task_id: 'task-123',
        };

        await expect(listTaskObservers(params, depsWithMatrix)).rejects.toThrow(
          'Task task-123 does not have an associated communication channel'
        );
      });
    });

    describe('Observer listing', () => {
      it('should list all observers', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
            participants: [
              {
                id: '@user1:matrix.org',
                type: 'human',
                role: 'observer',
                invitedAt: 1000,
              },
              {
                id: '@user2:matrix.org',
                type: 'human',
                role: 'observer',
                invitedAt: 1100,
              },
            ],
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskObserversParams = {
          task_id: 'task-123',
        };

        const result = await listTaskObservers(params, depsWithMatrix);

        expect(result).toEqual({
          task_id: 'task-123',
          observers: [
            {
              id: '@user1:matrix.org',
              type: 'human',
              role: 'observer',
            },
            {
              id: '@user2:matrix.org',
              type: 'human',
              role: 'observer',
            },
          ],
        });
      });

      it('should filter to only observers and humans', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
            participants: [
              {
                id: '@user1:matrix.org',
                type: 'human',
                role: 'observer',
                invitedAt: 1000,
              },
              {
                id: '@agent:matrix.org',
                type: 'agent',
                role: 'participant',
                invitedAt: 1100,
              },
              {
                id: '@user2:matrix.org',
                type: 'human',
                role: 'participant',
                invitedAt: 1200,
              },
            ],
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskObserversParams = {
          task_id: 'task-123',
        };

        const result = await listTaskObservers(params, depsWithMatrix);

        expect(result.observers).toHaveLength(2);
        expect(result.observers[0].id).toBe('@user1:matrix.org');
        expect(result.observers[1].id).toBe('@user2:matrix.org');
      });

      it('should return empty array when no observers', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
            participants: [],
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskObserversParams = {
          task_id: 'task-123',
        };

        const result = await listTaskObservers(params, depsWithMatrix);

        expect(result.observers).toEqual([]);
      });

      it('should handle undefined participants', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
            participants: undefined,
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskObserversParams = {
          task_id: 'task-123',
        };

        const result = await listTaskObservers(params, depsWithMatrix);

        expect(result.observers).toEqual([]);
      });

      it('should include agent observers', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          matrixRoom: {
            roomId: '!room123:matrix.org',
            createdAt: 1000,
            participants: [
              {
                id: '@agent1:matrix.org',
                type: 'agent',
                role: 'observer',
                invitedAt: 1000,
              },
            ],
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskObserversParams = {
          task_id: 'task-123',
        };

        const result = await listTaskObservers(params, depsWithMatrix);

        expect(result.observers).toHaveLength(1);
        expect(result.observers[0].id).toBe('@agent1:matrix.org');
        expect(result.observers[0].type).toBe('agent');
      });
    });
  });
});
