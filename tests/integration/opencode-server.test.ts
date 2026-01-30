import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ExecutionManager } from '../../src/execution-manager.js';
import { OpenCodeClientManager } from '../../src/opencode-client-manager.js';
import type { ExecutionRequest } from '../../src/types/execution.js';

const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:3100';

describe('OpenCode Server Integration', () => {
  let execution: ExecutionManager;
  let openCodeEnabled: boolean;

  beforeAll(async () => {
    openCodeEnabled = process.env.OPENCODE_SERVER_ENABLED === 'true';

    execution = new ExecutionManager({
      image: 'ghcr.io/anthropics/claude-code:latest',
      cpuLimit: '1.0',
      memoryLimit: '1g',
      timeoutMs: 60000,
      gracePeriodMs: 5000,
      openCodeServerEnabled: openCodeEnabled,
      openCodeServerUrl: OPENCODE_SERVER_URL,
    });
  });

  afterAll(() => {
    execution.cleanup();
  });

  describe('Health Check', () => {
    it('should connect to OpenCode server', async () => {
      if (!openCodeEnabled) {
        console.log('Skipping OpenCode server tests (not enabled)');
        return;
      }

      const client = new OpenCodeClientManager({
        enabled: true,
        serverUrl: OPENCODE_SERVER_URL,
        healthCheckIntervalMs: 5000,
        maxRetries: 3,
        retryDelayMs: 1000,
      });

      const healthy = await client.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe('Task Execution', () => {
    it('should execute simple task', async () => {
      const request: ExecutionRequest = {
        taskId: `test-${Date.now()}`,
        agentId: 'integration-test-agent',
        prompt: "echo 'Hello from OpenCode'",
        workspaceBlockId: 'test-block',
        timeout: 30000,
      };

      const result = await execution.execute(request);

      expect(result.taskId).toBe(request.taskId);
      expect(['success', 'error', 'timeout']).toContain(result.status);
      expect(result.output).toBeDefined();
      expect(result.durationMs).toBeGreaterThan(0);
    }, 60000);

    it.skip('should handle task timeout', async () => {
      const request: ExecutionRequest = {
        taskId: `test-timeout-${Date.now()}`,
        agentId: 'integration-test-agent',
        prompt: 'sleep 60',
        workspaceBlockId: 'test-block',
        timeout: 5000,
      };

      const result = await execution.execute(request);

      expect(result.status).toBe('timeout');
      expect(result.error).toBeDefined();
    }, 15000);
  });

  describe('Event Streaming', () => {
    it('should receive events during execution', async () => {
      if (!openCodeEnabled) {
        console.log('Skipping event streaming test (not enabled)');
        return;
      }

      const events: any[] = [];
      const request: ExecutionRequest = {
        taskId: `test-events-${Date.now()}`,
        agentId: 'integration-test-agent',
        prompt: 'ls -la',
        workspaceBlockId: 'test-block',
        timeout: 30000,
      };

      const result = await execution.execute(request, (event) => {
        events.push(event);
      });

      expect(result.status).toBe('success');
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'output')).toBe(true);
    }, 60000);
  });

  describe('File Access', () => {
    it('should list files in workspace', async () => {
      if (!openCodeEnabled) {
        console.log('Skipping file access test (not enabled)');
        return;
      }

      const taskId = `test-files-${Date.now()}`;
      const request: ExecutionRequest = {
        taskId,
        agentId: 'integration-test-agent',
        prompt: "echo 'test' > test.txt && ls",
        workspaceBlockId: 'test-block',
        timeout: 30000,
      };

      await execution.execute(request);

      expect(execution.isTaskActive(taskId)).toBe(false);
    }, 60000);

    it('should read file content', async () => {
      if (!openCodeEnabled) {
        console.log('Skipping file read test (not enabled)');
        return;
      }

      const taskId = `test-read-${Date.now()}`;
      const request: ExecutionRequest = {
        taskId,
        agentId: 'integration-test-agent',
        prompt: "echo 'Hello World' > hello.txt",
        workspaceBlockId: 'test-block',
        timeout: 30000,
      };

      const result = await execution.execute(request);
      expect(result.status).toBe('success');
    }, 60000);
  });

  describe('Control Signals', () => {
    it.skip('should cancel running task', async () => {
      const taskId = `test-cancel-${Date.now()}`;
      const request: ExecutionRequest = {
        taskId,
        agentId: 'integration-test-agent',
        prompt: 'sleep 30',
        workspaceBlockId: 'test-block',
        timeout: 60000,
      };

      const executePromise = execution.execute(request);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const cancelled = await execution.cancelTask(taskId);
      expect(cancelled).toBe(true);

      const result = await executePromise;
      expect(['error', 'timeout']).toContain(result.status);
    }, 70000);

    it.skip('should handle pause in Docker mode only', async () => {
      if (openCodeEnabled) {
        console.log('Skipping pause test (not supported in OpenCode mode)');
        return;
      }

      const taskId = `test-pause-${Date.now()}`;
      const request: ExecutionRequest = {
        taskId,
        agentId: 'integration-test-agent',
        prompt: 'sleep 10',
        workspaceBlockId: 'test-block',
        timeout: 60000,
      };

      const executePromise = execution.execute(request);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const paused = await execution.pauseTask(taskId);
      expect(paused).toBe(true);

      const resumed = await execution.resumeTask(taskId);
      expect(resumed).toBe(true);

      await execution.cancelTask(taskId);
      await executePromise.catch(() => {});
    }, 70000);
  });

  describe('Container Info', () => {
    it('should track active tasks', async () => {
      const taskId = `test-tracking-${Date.now()}`;
      const request: ExecutionRequest = {
        taskId,
        agentId: 'integration-test-agent',
        prompt: "echo 'test'",
        workspaceBlockId: 'test-block',
        timeout: 30000,
      };

      const result = await execution.execute(request);

      expect(result.taskId).toBe(taskId);
      expect(execution.isTaskActive(taskId)).toBe(false);
    }, 60000);

    it('should return container info for active task', async () => {
      const taskId = `test-info-${Date.now()}`;
      const request: ExecutionRequest = {
        taskId,
        agentId: 'integration-test-agent',
        prompt: 'sleep 5',
        workspaceBlockId: 'test-block',
        timeout: 30000,
      };

      const executePromise = execution.execute(request);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const info = execution.getContainerInfo(taskId);
      if (execution.isTaskActive(taskId)) {
        expect(info).toBeDefined();
        expect(info?.taskId).toBe(taskId);
      }

      await execution.cancelTask(taskId);
      await executePromise.catch(() => {});
    }, 40000);
  });
});
