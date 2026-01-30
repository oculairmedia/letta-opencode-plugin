import {
  sendTaskMessage,
  type SendTaskMessageParams,
  type TaskMessageDependencies,
} from '../../src/tools/task-message-tools.js';
import type { TaskRegistry } from '../../src/task-registry.js';
import type { WorkspaceManager } from '../../src/workspace-manager.js';
import type { MatrixRoomManager } from '../../src/matrix-room-manager.js';

describe('task-message-tools', () => {
  let mockDeps: jest.Mocked<TaskMessageDependencies>;
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

  describe('sendTaskMessage', () => {
    describe('Task validation', () => {
      it('should throw error when task not found', async () => {
        mockRegistry.getTask.mockReturnValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'nonexistent-task',
          message: 'Test message',
          message_type: 'update',
        };

        await expect(sendTaskMessage(params, mockDeps)).rejects.toThrow(
          'Task nonexistent-task not found'
        );
      });

      it('should throw error when task has no workspace block', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        await expect(sendTaskMessage(params, mockDeps)).rejects.toThrow(
          'Task task-123 does not have a workspace block'
        );
      });

      it('should throw error when task is not running or paused', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'completed',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        await expect(sendTaskMessage(params, mockDeps)).rejects.toThrow(
          'Cannot send message to task with status: completed'
        );
      });

      it('should allow messages for running tasks', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        await sendTaskMessage(params, mockDeps);

        expect(mockWorkspace.appendEvent).toHaveBeenCalled();
      });

      it('should allow messages for paused tasks', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'paused',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        await sendTaskMessage(params, mockDeps);

        expect(mockWorkspace.appendEvent).toHaveBeenCalled();
      });
    });

    describe('Message recording', () => {
      it('should append message event to workspace', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Progress update',
          message_type: 'update',
        };

        await sendTaskMessage(params, mockDeps);

        expect(mockWorkspace.appendEvent).toHaveBeenCalledWith(
          'agent-456',
          'block-123',
          expect.objectContaining({
            type: 'task_progress',
            message: 'Progress update',
            data: expect.objectContaining({
              message_type: 'update',
            }),
          })
        );
      });

      it('should generate unique message ID', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        const result = await sendTaskMessage(params, mockDeps);

        expect(result.message_id).toMatch(/^msg-\d+$/);
      });

      it('should use default message type of update', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.data?.message_type).toBe('update');
        expect(callArgs?.[2]?.type).toBe('task_progress');
      });

      it('should include metadata in event data', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
          metadata: { step: 3, total: 10 },
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.data).toMatchObject({
          step: 3,
          total: 10,
        });
      });
    });

    describe('Message type mapping', () => {
      it("should map 'update' to task_progress event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Progress update',
          message_type: 'update',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_progress');
      });

      it("should map 'feedback' to task_feedback event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Good work',
          message_type: 'feedback',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_feedback');
      });

      it("should map 'context_change' to task_runtime_update event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Context has changed',
          message_type: 'context_change',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_runtime_update');
      });

      it("should map 'requirement_change' to task_runtime_update event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Requirements updated',
          message_type: 'requirement_change',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_runtime_update');
      });

      it("should map 'priority_change' to task_runtime_update event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Priority changed to high',
          message_type: 'priority_change',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_runtime_update');
      });

      it("should map 'clarification' to task_feedback event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Need clarification on approach',
          message_type: 'clarification',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_feedback');
      });

      it("should map 'correction' to task_feedback event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Please revise',
          message_type: 'correction',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_feedback');
      });

      it("should map 'guidance' to task_feedback event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Try this approach',
          message_type: 'guidance',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_feedback');
      });

      it("should map 'approval' to task_feedback event", async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Approved!',
          message_type: 'approval',
        };

        await sendTaskMessage(params, mockDeps);

        const callArgs = mockWorkspace.appendEvent.mock.calls[0];
        expect(callArgs?.[2]?.type).toBe('task_feedback');
      });
    });

    describe('Matrix integration', () => {
      it('should send Matrix update when Matrix is enabled and room exists', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
          matrixRoom: {
            roomId: '!room123:matrix.org',
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Task update',
          message_type: 'update',
        };

        await sendTaskMessage(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
          '!room123:matrix.org',
          'task-123',
          '[update] Task update',
          'progress'
        );
      });

      it('should not send Matrix update when Matrix is disabled', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
          matrixRoom: {
            roomId: '!room123:matrix.org',
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        await sendTaskMessage(params, mockDeps);

        // No Matrix call should be made
      });

      it('should not send Matrix update when task has no Matrix room', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
          matrixRoom: undefined,
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        await sendTaskMessage(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).not.toHaveBeenCalled();
      });

      it('should map all message types to progress Matrix event', async () => {
        const mockMatrixManager = {
          sendTaskUpdate: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<MatrixRoomManager>;

        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
          matrixRoom: {
            roomId: '!room123:matrix.org',
          },
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const depsWithMatrix = {
          ...mockDeps,
          matrix: mockMatrixManager,
        };

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'feedback',
        };

        await sendTaskMessage(params, depsWithMatrix);

        expect(mockMatrixManager.sendTaskUpdate).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.any(String),
          'progress'
        );
      });
    });

    describe('Response format', () => {
      it('should return message ID and timestamp', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
          workspaceBlockId: 'block-123',
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockWorkspace.appendEvent.mockResolvedValue(undefined);

        const beforeTime = Date.now();

        const params: SendTaskMessageParams = {
          task_id: 'task-123',
          message: 'Test message',
          message_type: 'update',
        };

        const result = await sendTaskMessage(params, mockDeps);

        const afterTime = Date.now();

        expect(result).toEqual({
          task_id: 'task-123',
          message_id: expect.stringMatching(/^msg-\d+$/),
          timestamp: expect.any(Number),
        });
        expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
        expect(result.timestamp).toBeLessThanOrEqual(afterTime);
      });
    });
  });
});
