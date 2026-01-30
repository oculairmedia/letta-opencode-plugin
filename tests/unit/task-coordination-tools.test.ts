import {
  listTaskChannels,
  getTaskChannel,
  sendTaskUpdate,
  sendTaskControl,
  type ListTaskChannelsParams,
  type GetTaskChannelParams,
  type SendTaskUpdateParams,
  type SendTaskControlParams,
  type TaskCoordinationDependencies,
} from '../../src/tools/task-coordination-tools.js';
import type { TaskRegistry } from '../../src/task-registry.js';
import type { MatrixRoomManager } from '../../src/matrix-room-manager.js';

describe('task-coordination-tools', () => {
  let mockDeps: jest.Mocked<TaskCoordinationDependencies>;
  let mockRegistry: jest.Mocked<TaskRegistry>;
  let mockMatrix: jest.Mocked<MatrixRoomManager> | null;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRegistry = {
      getTask: jest.fn(),
      getAllTasks: jest.fn(),
      findTasksByAgent: jest.fn(),
      findTaskByMatrixRoom: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockMatrix = null;

    mockDeps = {
      registry: mockRegistry,
      matrix: mockMatrix,
    };
  });

  describe('listTaskChannels', () => {
    describe('Coordination validation', () => {
      it('should throw error when Matrix is not enabled', async () => {
        const params: ListTaskChannelsParams = {
          include_completed: false,
        };

        await expect(listTaskChannels(params, mockDeps)).rejects.toThrow(
          'Task coordination is not enabled for this deployment'
        );
      });
    });

    describe('Channel listing', () => {
      it('should list all task channels when no agent filter', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTasks = [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room1:matrix.org',
              createdAt: 1000,
            },
          },
          {
            taskId: 'task-2',
            agentId: 'agent-2',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room2:matrix.org',
              createdAt: 2000,
            },
          },
        ];

        mockRegistry.getAllTasks.mockReturnValue(mockTasks as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskChannelsParams = {
          include_completed: false,
        };

        const result = await listTaskChannels(params, depsWithMatrix);

        expect(result.channels).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.channels[0].task_id).toBe('task-1');
        expect(result.channels[1].task_id).toBe('task-2');
      });

      it('should filter by agent when agent_id provided', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTasks = [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room1:matrix.org',
              createdAt: 1000,
            },
          },
        ];

        mockRegistry.findTasksByAgent.mockReturnValue(mockTasks as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskChannelsParams = {
          agent_id: 'agent-1',
          include_completed: false,
        };

        await listTaskChannels(params, depsWithMatrix);

        expect(mockRegistry.findTasksByAgent).toHaveBeenCalledWith('agent-1');
        expect(mockRegistry.getAllTasks).not.toHaveBeenCalled();
      });

      it('should exclude tasks without Matrix rooms', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTasks = [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room1:matrix.org',
              createdAt: 1000,
            },
          },
          {
            taskId: 'task-2',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: undefined,
          },
        ];

        mockRegistry.getAllTasks.mockReturnValue(mockTasks as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskChannelsParams = {
          include_completed: false,
        };

        const result = await listTaskChannels(params, depsWithMatrix);

        expect(result.channels).toHaveLength(1);
        expect(result.channels[0].task_id).toBe('task-1');
      });

      it('should exclude completed tasks by default', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTasks = [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room1:matrix.org',
              createdAt: 1000,
            },
          },
          {
            taskId: 'task-2',
            agentId: 'agent-1',
            status: 'completed',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room2:matrix.org',
              createdAt: 2000,
            },
          },
        ];

        mockRegistry.getAllTasks.mockReturnValue(mockTasks as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskChannelsParams = {
          include_completed: false,
        };

        const result = await listTaskChannels(params, depsWithMatrix);

        expect(result.channels).toHaveLength(1);
        expect(result.channels[0].task_id).toBe('task-1');
      });

      it('should include completed tasks when include_completed is true', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTasks = [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room1:matrix.org',
              createdAt: 1000,
            },
          },
          {
            taskId: 'task-2',
            agentId: 'agent-1',
            status: 'completed',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room2:matrix.org',
              createdAt: 2000,
            },
          },
        ];

        mockRegistry.getAllTasks.mockReturnValue(mockTasks as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskChannelsParams = {
          include_completed: true,
        };

        const result = await listTaskChannels(params, depsWithMatrix);

        expect(result.channels).toHaveLength(2);
      });

      it('should include workspace_block_id when available', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTasks = [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            workspaceBlockId: 'block-123',
            matrixRoom: {
              roomId: '!room1:matrix.org',
              createdAt: 1000,
            },
          },
        ];

        mockRegistry.getAllTasks.mockReturnValue(mockTasks as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskChannelsParams = {
          include_completed: false,
        };

        const result = await listTaskChannels(params, depsWithMatrix);

        expect(result.channels[0].workspace_block_id).toBe('block-123');
      });

      it('should include participants when available', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        const mockTasks = [
          {
            taskId: 'task-1',
            agentId: 'agent-1',
            status: 'running',
            createdAt: Date.now(),
            matrixRoom: {
              roomId: '!room1:matrix.org',
              createdAt: 1000,
              participants: [
                {
                  id: '@user1:matrix.org',
                  type: 'human',
                  role: 'observer',
                  invitedAt: 1000,
                },
              ],
            },
          },
        ];

        mockRegistry.getAllTasks.mockReturnValue(mockTasks as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: ListTaskChannelsParams = {
          include_completed: false,
        };

        const result = await listTaskChannels(params, depsWithMatrix);

        expect(result.channels[0].participants).toHaveLength(1);
        expect(result.channels[0].participants?.[0]).toEqual({
          id: '@user1:matrix.org',
          type: 'human',
          role: 'observer',
          invited_at: 1000,
        });
      });
    });
  });

  describe('getTaskChannel', () => {
    describe('Coordination validation', () => {
      it('should throw error when Matrix is not enabled', async () => {
        const params: GetTaskChannelParams = {
          task_id: 'task-123',
        };

        await expect(getTaskChannel(params, mockDeps)).rejects.toThrow(
          'Task coordination is not enabled for this deployment'
        );
      });
    });

    describe('Channel retrieval', () => {
      it('should get channel by task_id', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

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

        const params: GetTaskChannelParams = {
          task_id: 'task-123',
        };

        const result = await getTaskChannel(params, depsWithMatrix);

        expect(result.channel.task_id).toBe('task-123');
        expect(result.channel.channel_id).toBe('!room123:matrix.org');
      });

      it('should get channel by channel_id when task_id not found', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

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

        mockRegistry.getTask.mockReturnValue(undefined);
        mockRegistry.findTaskByMatrixRoom.mockReturnValue(mockTask as any);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: GetTaskChannelParams = {
          channel_id: '!room123:matrix.org',
        };

        const result = await getTaskChannel(params, depsWithMatrix);

        expect(result.channel.channel_id).toBe('!room123:matrix.org');
        expect(mockRegistry.findTaskByMatrixRoom).toHaveBeenCalledWith('!room123:matrix.org');
      });

      it('should throw error when task not found', async () => {
        const mockMatrixManager = {} as jest.Mocked<MatrixRoomManager>;

        mockRegistry.getTask.mockReturnValue(undefined);
        mockRegistry.findTaskByMatrixRoom.mockReturnValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: GetTaskChannelParams = {
          task_id: 'nonexistent-task',
        };

        await expect(getTaskChannel(params, depsWithMatrix)).rejects.toThrow(
          'Task communication channel not found'
        );
      });

      it('should throw error when task has no Matrix room', async () => {
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

        const params: GetTaskChannelParams = {
          task_id: 'task-123',
        };

        await expect(getTaskChannel(params, depsWithMatrix)).rejects.toThrow(
          'Task communication channel not found'
        );
      });
    });
  });

  describe('sendTaskUpdate', () => {
    describe('Coordination validation', () => {
      it('should throw error when Matrix is not enabled', async () => {
        const params: SendTaskUpdateParams = {
          task_id: 'task-123',
          message: 'Update',
          event_type: 'progress',
        };

        await expect(sendTaskUpdate(params, mockDeps)).rejects.toThrow(
          'Task coordination is not enabled for this deployment'
        );
      });
    });

    describe('Update sending', () => {
      it('should send update to Matrix channel', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
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

        const params: SendTaskUpdateParams = {
          task_id: 'task-123',
          message: 'Progress update',
          event_type: 'progress',
        };

        const result = await sendTaskUpdate(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
          '!room123:matrix.org',
          'task-123',
          'Progress update',
          'progress'
        );
        expect(result).toEqual({
          channel_id: '!room123:matrix.org',
          task_id: 'task-123',
        });
      });

      it('should throw error when task not found', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        mockRegistry.getTask.mockReturnValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendTaskUpdateParams = {
          task_id: 'nonexistent-task',
          message: 'Update',
          event_type: 'progress',
        };

        await expect(sendTaskUpdate(params, depsWithMatrix)).rejects.toThrow(
          'Task does not have an associated communication channel'
        );
      });

      it('should throw error when task has no Matrix room', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn(),
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

        const params: SendTaskUpdateParams = {
          task_id: 'task-123',
          message: 'Update',
          event_type: 'progress',
        };

        await expect(sendTaskUpdate(params, depsWithMatrix)).rejects.toThrow(
          'Task does not have an associated communication channel'
        );
      });

      it('should handle error event type', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
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

        const params: SendTaskUpdateParams = {
          task_id: 'task-123',
          message: 'Error occurred',
          event_type: 'error',
        };

        await sendTaskUpdate(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          'Error occurred',
          'error'
        );
      });

      it('should handle status_change event type', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
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

        const params: SendTaskUpdateParams = {
          task_id: 'task-123',
          message: 'Status changed',
          event_type: 'status_change',
        };

        await sendTaskUpdate(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          'Status changed',
          'status_change'
        );
      });
    });
  });

  describe('sendTaskControl', () => {
    describe('Coordination validation', () => {
      it('should throw error when Matrix is not enabled', async () => {
        const params: SendTaskControlParams = {
          task_id: 'task-123',
          control: 'pause',
        };

        await expect(sendTaskControl(params, mockDeps)).rejects.toThrow(
          'Task coordination is not enabled for this deployment'
        );
      });
    });

    describe('Control signal sending', () => {
      it('should send pause control signal', async () => {
        const mockMatrixManager = {
          sendControlSignal: jest.fn().mockResolvedValue(undefined),
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

        const params: SendTaskControlParams = {
          task_id: 'task-123',
          control: 'pause',
          reason: 'User requested pause',
        };

        const result = await sendTaskControl(params, depsWithMatrix);

        expect(mockMatrixManager.sendControlSignal).toHaveBeenCalledWith(
          '!room123:matrix.org',
          'task-123',
          'pause',
          'User requested pause'
        );
        expect(result).toEqual({
          channel_id: '!room123:matrix.org',
          task_id: 'task-123',
          control: 'pause',
        });
      });

      it('should send resume control signal', async () => {
        const mockMatrixManager = {
          sendControlSignal: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'paused',
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

        const params: SendTaskControlParams = {
          task_id: 'task-123',
          control: 'resume',
        };

        await sendTaskControl(params, depsWithMatrix);

        expect(mockMatrixManager.sendControlSignal).toHaveBeenCalledWith(
          '!room123:matrix.org',
          'task-123',
          'resume',
          undefined
        );
      });

      it('should send cancel control signal', async () => {
        const mockMatrixManager = {
          sendControlSignal: jest.fn().mockResolvedValue(undefined),
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

        const params: SendTaskControlParams = {
          task_id: 'task-123',
          control: 'cancel',
          reason: 'Task no longer needed',
        };

        await sendTaskControl(params, depsWithMatrix);

        expect(mockMatrixManager.sendControlSignal).toHaveBeenCalledWith(
          '!room123:matrix.org',
          'task-123',
          'cancel',
          'Task no longer needed'
        );
      });

      it('should throw error when task not found', async () => {
        const mockMatrixManager = {
          sendControlSignal: jest.fn(),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        mockRegistry.getTask.mockReturnValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendTaskControlParams = {
          task_id: 'nonexistent-task',
          control: 'pause',
        };

        await expect(sendTaskControl(params, depsWithMatrix)).rejects.toThrow(
          'Task does not have an associated communication channel'
        );
      });

      it('should throw error when task has no Matrix room', async () => {
        const mockMatrixManager = {
          sendControlSignal: jest.fn(),
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

        const params: SendTaskControlParams = {
          task_id: 'task-123',
          control: 'pause',
        };

        await expect(sendTaskControl(params, depsWithMatrix)).rejects.toThrow(
          'Task does not have an associated communication channel'
        );
      });
    });
  });
});
