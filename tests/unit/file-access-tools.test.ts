import {
  getTaskFiles,
  readTaskFile,
  type GetTaskFilesParams,
  type ReadTaskFileParams,
  type FileAccessContext,
} from '../../src/tools/file-access-tools.js';
import type { ExecutionManager } from '../../src/execution-manager.js';
import type { TaskRegistry } from '../../src/task-registry.js';

describe('file-access-tools', () => {
  let mockContext: jest.Mocked<FileAccessContext>;
  let mockExecution: jest.Mocked<ExecutionManager>;
  let mockRegistry: jest.Mocked<TaskRegistry>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockExecution = {
      isTaskActive: jest.fn(),
      getTaskFiles: jest.fn(),
      readTaskFile: jest.fn(),
    } as unknown as jest.Mocked<ExecutionManager>;

    mockRegistry = {
      getTask: jest.fn(),
    } as unknown as jest.Mocked<TaskRegistry>;

    mockContext = {
      execution: mockExecution,
      registry: mockRegistry,
    };
  });

  describe('getTaskFiles', () => {
    describe('Task validation', () => {
      it('should throw error when task not found', async () => {
        mockRegistry.getTask.mockReturnValue(undefined);

        const params: GetTaskFilesParams = {
          task_id: 'nonexistent-task',
        };

        await expect(getTaskFiles(params, mockContext)).rejects.toThrow(
          'Task not found: nonexistent-task'
        );
      });

      it('should throw error when task is not active', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'completed',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(false);

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
        };

        await expect(getTaskFiles(params, mockContext)).rejects.toThrow(
          'Cannot list files for inactive task. Task status: completed'
        );
      });

      it('should check if task is active before listing files', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.getTaskFiles.mockResolvedValue(['/file1.txt', '/file2.txt']);

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
        };

        await getTaskFiles(params, mockContext);

        expect(mockExecution.isTaskActive).toHaveBeenCalledWith('task-123');
      });
    });

    describe('File listing', () => {
      it('should return all files when no path filter specified', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.getTaskFiles.mockResolvedValue([
          '/file1.txt',
          '/dir/file2.txt',
          '/dir/subdir/file3.txt',
        ]);

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
        };

        const result = await getTaskFiles(params, mockContext);

        expect(result).toEqual({
          task_id: 'task-123',
          path: '/',
          files: ['/file1.txt', '/dir/file2.txt', '/dir/subdir/file3.txt'],
        });
      });

      it('should filter files by path when path specified', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.getTaskFiles.mockResolvedValue([
          '/file1.txt',
          '/dir/file2.txt',
          '/dir/subdir/file3.txt',
          '/other/file4.txt',
        ]);

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
          path: '/dir',
        };

        const result = await getTaskFiles(params, mockContext);

        expect(result).toEqual({
          task_id: 'task-123',
          path: '/dir',
          files: ['/dir/file2.txt', '/dir/subdir/file3.txt'],
        });
      });

      it('should return empty array when no files match path filter', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.getTaskFiles.mockResolvedValue(['/file1.txt', '/dir/file2.txt']);

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
          path: '/nonexistent',
        };

        const result = await getTaskFiles(params, mockContext);

        expect(result.files).toEqual([]);
      });

      it('should default to root path when path not specified', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.getTaskFiles.mockResolvedValue(['/file1.txt']);

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
        };

        const result = await getTaskFiles(params, mockContext);

        expect(result.path).toBe('/');
      });
    });

    describe('Error handling', () => {
      it('should wrap execution errors with descriptive message', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.getTaskFiles.mockRejectedValue(new Error('OpenCode connection failed'));

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
        };

        await expect(getTaskFiles(params, mockContext)).rejects.toThrow(
          'Failed to list files: OpenCode connection failed'
        );
      });

      it('should rethrow non-Error exceptions', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.getTaskFiles.mockRejectedValue('string error');

        const params: GetTaskFilesParams = {
          task_id: 'task-123',
        };

        await expect(getTaskFiles(params, mockContext)).rejects.toBe('string error');
      });
    });
  });

  describe('readTaskFile', () => {
    describe('Task validation', () => {
      it('should throw error when task not found', async () => {
        mockRegistry.getTask.mockReturnValue(undefined);

        const params: ReadTaskFileParams = {
          task_id: 'nonexistent-task',
          file_path: '/test.txt',
        };

        await expect(readTaskFile(params, mockContext)).rejects.toThrow(
          'Task not found: nonexistent-task'
        );
      });

      it('should throw error when task is not active', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'completed',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(false);

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/test.txt',
        };

        await expect(readTaskFile(params, mockContext)).rejects.toThrow(
          'Cannot read files from inactive task. Task status: completed'
        );
      });

      it('should check if task is active before reading file', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.readTaskFile.mockResolvedValue('file content');

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/test.txt',
        };

        await readTaskFile(params, mockContext);

        expect(mockExecution.isTaskActive).toHaveBeenCalledWith('task-123');
      });
    });

    describe('File reading', () => {
      it('should return file content and metadata', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.readTaskFile.mockResolvedValue('Hello, World!');

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/test.txt',
        };

        const result = await readTaskFile(params, mockContext);

        expect(result).toEqual({
          task_id: 'task-123',
          file_path: '/test.txt',
          content: 'Hello, World!',
          size: 13,
        });
      });

      it('should calculate correct size for empty files', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.readTaskFile.mockResolvedValue('');

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/empty.txt',
        };

        const result = await readTaskFile(params, mockContext);

        expect(result.size).toBe(0);
      });

      it('should calculate correct size for large files', async () => {
        const largeContent = 'x'.repeat(10000);
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.readTaskFile.mockResolvedValue(largeContent);

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/large.txt',
        };

        const result = await readTaskFile(params, mockContext);

        expect(result.size).toBe(10000);
      });

      it('should pass correct parameters to execution manager', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.readTaskFile.mockResolvedValue('content');

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/dir/subdir/file.txt',
        };

        await readTaskFile(params, mockContext);

        expect(mockExecution.readTaskFile).toHaveBeenCalledWith('task-123', '/dir/subdir/file.txt');
      });
    });

    describe('Error handling', () => {
      it('should wrap execution errors with descriptive message', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.readTaskFile.mockRejectedValue(new Error('File not found in workspace'));

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/missing.txt',
        };

        await expect(readTaskFile(params, mockContext)).rejects.toThrow(
          'Failed to read file: File not found in workspace'
        );
      });

      it('should rethrow non-Error exceptions', async () => {
        const mockTask = {
          taskId: 'task-123',
          agentId: 'agent-456',
          status: 'running',
          createdAt: Date.now(),
        };

        mockRegistry.getTask.mockReturnValue(mockTask as any);
        mockExecution.isTaskActive.mockReturnValue(true);
        mockExecution.readTaskFile.mockRejectedValue('string error');

        const params: ReadTaskFileParams = {
          task_id: 'task-123',
          file_path: '/test.txt',
        };

        await expect(readTaskFile(params, mockContext)).rejects.toBe('string error');
      });
    });
  });
});
