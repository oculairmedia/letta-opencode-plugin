import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { ExecutionManager } from '../../src/execution-manager.js';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock OpenCodeClientManager
jest.mock('../../src/opencode-client-manager.js', () => ({
  OpenCodeClientManager: jest.fn().mockImplementation(() => ({
    createSession: jest.fn(),
    subscribeToEvents: jest.fn(),
    sendPrompt: jest.fn(),
    abortSession: jest.fn(),
    removeSession: jest.fn(),
    listFiles: jest.fn(),
    readFile: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

import { spawn } from 'child_process';
import { OpenCodeClientManager } from '../../src/opencode-client-manager.js';

describe('ExecutionManager', () => {
  let execution: ExecutionManager;
  let mockSpawn: jest.Mock;
  let mockOpenCodeClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawn = spawn as jest.Mock;

    execution = new ExecutionManager({
      image: 'test-image',
      cpuLimit: '1.0',
      memoryLimit: '1g',
      timeoutMs: 30000,
      gracePeriodMs: 5000,
      openCodeServerEnabled: false,
    });
  });

  afterEach(() => {
    execution.cleanup();
  });

  describe('Configuration', () => {
    it('should initialize with Docker mode', () => {
      expect(execution).toBeDefined();
    });

    it('should initialize with OpenCode server mode', () => {
      const serverExecution = new ExecutionManager({
        image: 'test-image',
        cpuLimit: '1.0',
        memoryLimit: '1g',
        timeoutMs: 30000,
        gracePeriodMs: 5000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });
      expect(serverExecution).toBeDefined();
      expect(OpenCodeClientManager).toHaveBeenCalledWith({
        enabled: true,
        serverUrl: 'http://localhost:3100',
        healthCheckIntervalMs: 5000,
        maxRetries: 3,
        retryDelayMs: 1000,
      });
      serverExecution.cleanup();
    });

    it('should not create OpenCodeClientManager when server disabled', () => {
      jest.clearAllMocks();
      const dockerExecution = new ExecutionManager({
        image: 'test-image',
        openCodeServerEnabled: false,
        timeoutMs: 30000,
      });
      expect(OpenCodeClientManager).not.toHaveBeenCalled();
      dockerExecution.cleanup();
    });
  });

  describe('Task Tracking', () => {
    it('should return empty active tasks list initially', () => {
      const tasks = execution.getActiveTasks();
      expect(tasks).toEqual([]);
    });

    it('should check if task is active', () => {
      const isActive = execution.isTaskActive('test-task');
      expect(isActive).toBe(false);
    });

    it('should return undefined for non-existent container info', () => {
      const info = execution.getContainerInfo('test-task');
      expect(info).toBeUndefined();
    });
  });

  describe('executeWithDocker', () => {
    it('should execute task successfully with Docker', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-123',
        agentId: 'agent-456',
        prompt: 'Test prompt',
        workspaceBlockId: 'block-123',
      });

      // Simulate successful output
      mockProcess.stdout.emit('data', Buffer.from('Task output'));
      mockProcess.emit('close', 0);

      const result = await executePromise;

      expect(result.status).toBe('success');
      expect(result.taskId).toBe('task-123');
      expect(result.output).toContain('Task output');
      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining([
          'run',
          '--rm',
          '--name',
          expect.stringContaining('opencode-task-123'),
        ])
      );
    });

    it('should handle Docker execution error', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-error',
        agentId: 'agent-456',
        prompt: 'Test prompt',
        workspaceBlockId: 'block-error',
      });

      // Simulate error output
      mockProcess.stderr.emit('data', Buffer.from('Error occurred'));
      mockProcess.emit('close', 1);

      const result = await executePromise;

      expect(result.status).toBe('error');
      expect(result.error).toContain('Error occurred');
    });

    it('should handle Docker spawn error', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-spawn-error',
        agentId: 'agent-456',
        prompt: 'Test prompt',
        workspaceBlockId: 'block-spawn-error',
      });

      // Simulate spawn error
      mockProcess.emit('error', new Error('Spawn failed'));

      const result = await executePromise;

      expect(result.status).toBe('error');
      expect(result.error).toContain('Failed to start container');
    });

    it('should handle Docker execution timeout', async () => {
      jest.useFakeTimers();

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const shortTimeoutExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 1000,
        gracePeriodMs: 500,
        openCodeServerEnabled: false,
      });

      const executePromise = shortTimeoutExecution.execute({
        taskId: 'task-timeout',
        agentId: 'agent-456',
        prompt: 'Long running task',
        workspaceBlockId: 'block-timeout',
      });

      // Fast-forward past timeout
      jest.advanceTimersByTime(1500);

      // Process receives kill signal and closes
      mockProcess.emit('close', null);

      const result = await executePromise;

      expect(result.status).toBe('timeout');
      expect(result.error).toContain('timed out');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');

      jest.useRealTimers();
      shortTimeoutExecution.cleanup();
    });

    it('should truncate output exceeding 50000 characters', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-large-output',
        agentId: 'agent-456',
        prompt: 'Large output task',
        workspaceBlockId: 'block-large-output',
      });

      // Emit very large output
      const largeOutput = 'x'.repeat(60000);
      mockProcess.stdout.emit('data', Buffer.from(largeOutput));
      mockProcess.emit('close', 0);

      const result = await executePromise;

      expect(result.output.length).toBeLessThanOrEqual(50000);
    });

    it('should include CPU and memory limits in Docker args', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-limits',
        agentId: 'agent-456',
        prompt: 'Test',
        workspaceBlockId: 'block-limits',
      });

      mockProcess.emit('close', 0);
      await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['--cpus', '1.0', '--memory', '1g'])
      );
    });
  });

  describe('executeWithOpenCodeServer', () => {
    let serverExecution: ExecutionManager;

    beforeEach(() => {
      serverExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 30000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });

      // Get the mock instance
      mockOpenCodeClient = (OpenCodeClientManager as jest.Mock).mock.results[
        (OpenCodeClientManager as jest.Mock).mock.results.length - 1
      ]?.value;
    });

    afterEach(() => {
      serverExecution.cleanup();
    });

    it('should execute task with OpenCode server successfully', async () => {
      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-123',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);

      // Simulate events
      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function, onError: Function) => {
          setTimeout(() => {
            onEvent({ type: 'output', data: 'Processing...' });
            onEvent({ type: 'complete', data: null });
          }, 10);
        }
      );

      const result = await serverExecution.execute({
        taskId: 'task-server',
        agentId: 'agent-456',
        prompt: 'Test prompt',
        workspaceBlockId: 'block-server',
      });

      expect(result.status).toBe('success');
      expect(result.taskId).toBe('task-server');
      expect(mockOpenCodeClient.createSession).toHaveBeenCalledWith(
        'task-server',
        'agent-456',
        'Test prompt'
      );
    });

    it('should handle OpenCode server error events', async () => {
      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-error',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);

      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function, onError: Function) => {
          setTimeout(() => {
            onEvent({ type: 'error', data: 'Something went wrong' });
            onEvent({ type: 'complete', data: null });
          }, 10);
        }
      );

      const result = await serverExecution.execute({
        taskId: 'task-error',
        agentId: 'agent-456',
        prompt: 'Error task',
        workspaceBlockId: 'block-error',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('Something went wrong');
    });

    it('should handle abort events', async () => {
      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-abort',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);

      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function, onError: Function) => {
          setTimeout(() => {
            onEvent({ type: 'abort', data: null });
          }, 10);
        }
      );

      const result = await serverExecution.execute({
        taskId: 'task-abort',
        agentId: 'agent-456',
        prompt: 'Abort task',
        workspaceBlockId: 'block-abort',
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('aborted');
    });

    it('should handle subscription errors', async () => {
      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-sub-error',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);

      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function, onError: Function) => {
          setTimeout(() => {
            onError(new Error('Subscription failed'));
          }, 10);
        }
      );

      const result = await serverExecution.execute({
        taskId: 'task-sub-error',
        agentId: 'agent-456',
        prompt: 'Sub error task',
        workspaceBlockId: 'block-sub-error',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('Subscription failed');
    });

    it('should call onEvent callback when provided', async () => {
      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-callback',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);

      const events: any[] = [];
      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function, onError: Function) => {
          setTimeout(() => {
            onEvent({ type: 'output', data: 'test' });
            onEvent({ type: 'complete', data: null });
          }, 10);
        }
      );

      await serverExecution.execute(
        {
          taskId: 'task-callback',
          agentId: 'agent-456',
          prompt: 'Callback task',
          workspaceBlockId: 'block-callback',
        },
        (event) => events.push(event)
      );

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('output');
    });
  });

  describe('killTask', () => {
    it('should return false for non-existent task', async () => {
      const result = await execution.killTask('non-existent');
      expect(result).toBe(false);
    });

    it('should kill Docker container task', async () => {
      // First, start a task to populate activeContainers
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      // Start execution (don't await, we want it running)
      const executePromise = execution.execute({
        taskId: 'task-to-kill',
        agentId: 'agent-456',
        prompt: 'Running task',
        workspaceBlockId: 'block-to-kill',
      });

      // Now kill it
      const killProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(killProcess);

      const killPromise = execution.killTask('task-to-kill');
      killProcess.emit('close', 0);

      const killResult = await killPromise;
      expect(killResult).toBe(true);

      // Clean up the execute
      mockProcess.emit('close', 0);
      await executePromise;
    });

    it('should handle kill failure', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-kill-fail',
        agentId: 'agent-456',
        prompt: 'Running task',
        workspaceBlockId: 'block-kill-fail',
      });

      const killProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(killProcess);

      const killPromise = execution.killTask('task-kill-fail');
      killProcess.emit('error', new Error('Kill failed'));

      const killResult = await killPromise;
      expect(killResult).toBe(false);

      mockProcess.emit('close', 0);
      await executePromise;
    });

    it('should abort OpenCode server session', async () => {
      const serverExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 30000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });

      mockOpenCodeClient = (OpenCodeClientManager as jest.Mock).mock.results[
        (OpenCodeClientManager as jest.Mock).mock.results.length - 1
      ]?.value;

      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-to-kill',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);
      mockOpenCodeClient.abortSession.mockResolvedValue(undefined);

      let completeTask: Function;
      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function, onError: Function) => {
          completeTask = () => onEvent({ type: 'complete', data: null });
        }
      );

      const executePromise = serverExecution.execute({
        taskId: 'server-task-kill',
        agentId: 'agent-456',
        prompt: 'Running',
        workspaceBlockId: 'block-server-kill',
      });

      // Small delay to let task start
      await new Promise((resolve) => setTimeout(resolve, 50));

      const killResult = await serverExecution.killTask('server-task-kill');
      expect(killResult).toBe(true);
      expect(mockOpenCodeClient.abortSession).toHaveBeenCalledWith('session-to-kill');

      // Complete the task
      completeTask!();
      await executePromise;
      serverExecution.cleanup();
    });
  });

  describe('pauseTask', () => {
    it('should return false for non-existent task', async () => {
      const result = await execution.pauseTask('non-existent');
      expect(result).toBe(false);
    });

    it('should pause Docker container', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-to-pause',
        agentId: 'agent-456',
        prompt: 'Running task',
        workspaceBlockId: 'block-to-pause',
      });

      const pauseProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(pauseProcess);

      const pausePromise = execution.pauseTask('task-to-pause');
      pauseProcess.emit('close', 0);

      const pauseResult = await pausePromise;
      expect(pauseResult).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('docker', ['pause', expect.any(String)]);

      mockProcess.emit('close', 0);
      await executePromise;
    });

    it('should return false for OpenCode server session', async () => {
      const serverExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 30000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });

      mockOpenCodeClient = (OpenCodeClientManager as jest.Mock).mock.results[
        (OpenCodeClientManager as jest.Mock).mock.results.length - 1
      ]?.value;

      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-pause',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);

      let completeTask: Function;
      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function) => {
          completeTask = () => onEvent({ type: 'complete', data: null });
        }
      );

      const executePromise = serverExecution.execute({
        taskId: 'server-task-pause',
        agentId: 'agent-456',
        prompt: 'Running',
        workspaceBlockId: 'block-server-pause',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const pauseResult = await serverExecution.pauseTask('server-task-pause');
      expect(pauseResult).toBe(false);

      completeTask!();
      await executePromise;
      serverExecution.cleanup();
    });
  });

  describe('resumeTask', () => {
    it('should return false for non-existent task', async () => {
      const result = await execution.resumeTask('non-existent');
      expect(result).toBe(false);
    });

    it('should resume Docker container', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);

      const executePromise = execution.execute({
        taskId: 'task-to-resume',
        agentId: 'agent-456',
        prompt: 'Running task',
        workspaceBlockId: 'block-to-resume',
      });

      const resumeProcess = new EventEmitter() as any;
      mockSpawn.mockReturnValue(resumeProcess);

      const resumePromise = execution.resumeTask('task-to-resume');
      resumeProcess.emit('close', 0);

      const resumeResult = await resumePromise;
      expect(resumeResult).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('docker', ['unpause', expect.any(String)]);

      mockProcess.emit('close', 0);
      await executePromise;
    });

    it('should return false for OpenCode server session', async () => {
      const serverExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 30000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });

      mockOpenCodeClient = (OpenCodeClientManager as jest.Mock).mock.results[
        (OpenCodeClientManager as jest.Mock).mock.results.length - 1
      ]?.value;

      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-resume',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);

      let completeTask: Function;
      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function) => {
          completeTask = () => onEvent({ type: 'complete', data: null });
        }
      );

      const executePromise = serverExecution.execute({
        taskId: 'server-task-resume',
        agentId: 'agent-456',
        prompt: 'Running',
        workspaceBlockId: 'block-server-resume',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const resumeResult = await serverExecution.resumeTask('server-task-resume');
      expect(resumeResult).toBe(false);

      completeTask!();
      await executePromise;
      serverExecution.cleanup();
    });
  });

  describe('cancelTask', () => {
    it('should call killTask', async () => {
      const result = await execution.cancelTask('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getTaskFiles', () => {
    it('should throw error for non-existent task', async () => {
      await expect(execution.getTaskFiles('non-existent')).rejects.toThrow(
        'Task not found or not using OpenCode server'
      );
    });

    it('should list files for OpenCode server task', async () => {
      const serverExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 30000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });

      mockOpenCodeClient = (OpenCodeClientManager as jest.Mock).mock.results[
        (OpenCodeClientManager as jest.Mock).mock.results.length - 1
      ]?.value;

      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-files',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);
      mockOpenCodeClient.listFiles.mockResolvedValue(['file1.ts', 'file2.ts']);

      let completeTask: Function;
      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function) => {
          completeTask = () => onEvent({ type: 'complete', data: null });
        }
      );

      const executePromise = serverExecution.execute({
        taskId: 'task-files',
        agentId: 'agent-456',
        prompt: 'Running',
        workspaceBlockId: 'block-files',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const files = await serverExecution.getTaskFiles('task-files');
      expect(files).toEqual(['file1.ts', 'file2.ts']);

      completeTask!();
      await executePromise;
      serverExecution.cleanup();
    });
  });

  describe('readTaskFile', () => {
    it('should throw error for non-existent task', async () => {
      await expect(execution.readTaskFile('non-existent', 'file.ts')).rejects.toThrow(
        'Task not found or not using OpenCode server'
      );
    });

    it('should read file for OpenCode server task', async () => {
      const serverExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 30000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });

      mockOpenCodeClient = (OpenCodeClientManager as jest.Mock).mock.results[
        (OpenCodeClientManager as jest.Mock).mock.results.length - 1
      ]?.value;

      mockOpenCodeClient.createSession.mockResolvedValue({
        sessionId: 'session-read',
      });
      mockOpenCodeClient.sendPrompt.mockResolvedValue(undefined);
      mockOpenCodeClient.readFile.mockResolvedValue('file contents');

      let completeTask: Function;
      mockOpenCodeClient.subscribeToEvents.mockImplementation(
        (sessionId: string, onEvent: Function) => {
          completeTask = () => onEvent({ type: 'complete', data: null });
        }
      );

      const executePromise = serverExecution.execute({
        taskId: 'task-read',
        agentId: 'agent-456',
        prompt: 'Running',
        workspaceBlockId: 'block-read',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const content = await serverExecution.readTaskFile('task-read', 'test.ts');
      expect(content).toBe('file contents');
      expect(mockOpenCodeClient.readFile).toHaveBeenCalledWith('session-read', 'test.ts');

      completeTask!();
      await executePromise;
      serverExecution.cleanup();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup without errors', () => {
      expect(() => execution.cleanup()).not.toThrow();
    });

    it('should cleanup OpenCode client', () => {
      const serverExecution = new ExecutionManager({
        image: 'test-image',
        timeoutMs: 30000,
        openCodeServerEnabled: true,
        openCodeServerUrl: 'http://localhost:3100',
      });

      mockOpenCodeClient = (OpenCodeClientManager as jest.Mock).mock.results[
        (OpenCodeClientManager as jest.Mock).mock.results.length - 1
      ]?.value;

      serverExecution.cleanup();
      expect(mockOpenCodeClient.cleanup).toHaveBeenCalled();
    });
  });
});
