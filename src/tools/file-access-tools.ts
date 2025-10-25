import { z } from "zod";
import type { ExecutionManager } from "../execution-manager.js";
import type { TaskRegistry } from "../task-registry.js";

export const GetTaskFilesSchema = z.object({
  task_id: z.string().describe("Task ID to list files for"),
  path: z.string().optional().describe("Optional path filter (default: / for root)"),
});

export const ReadTaskFileSchema = z.object({
  task_id: z.string().describe("Task ID to read file from"),
  file_path: z.string().describe("Path to the file to read"),
});

export type GetTaskFilesParams = z.infer<typeof GetTaskFilesSchema>;
export type ReadTaskFileParams = z.infer<typeof ReadTaskFileSchema>;

export interface FileAccessContext {
  execution: ExecutionManager;
  registry: TaskRegistry;
}

export async function getTaskFiles(
  params: GetTaskFilesParams,
  context: FileAccessContext
): Promise<{ files: string[]; task_id: string; path: string }> {
  const { task_id, path = "/" } = params;
  const { execution, registry } = context;

  const task = registry.getTask(task_id);
  if (!task) {
    throw new Error(`Task not found: ${task_id}`);
  }

  if (!execution.isTaskActive(task_id)) {
    throw new Error(
      `Cannot list files for inactive task. Task status: ${task.status}`
    );
  }

  try {
    const files = await execution.getTaskFiles(task_id);
    
    const filteredFiles = path === "/" 
      ? files 
      : files.filter(f => f.startsWith(path));

    return {
      task_id,
      path,
      files: filteredFiles,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
    throw error;
  }
}

export async function readTaskFile(
  params: ReadTaskFileParams,
  context: FileAccessContext
): Promise<{ task_id: string; file_path: string; content: string; size: number }> {
  const { task_id, file_path } = params;
  const { execution, registry } = context;

  const task = registry.getTask(task_id);
  if (!task) {
    throw new Error(`Task not found: ${task_id}`);
  }

  if (!execution.isTaskActive(task_id)) {
    throw new Error(
      `Cannot read files from inactive task. Task status: ${task.status}`
    );
  }

  const MAX_FILE_SIZE = parseInt(process.env.MAX_TASK_FILE_SIZE || "1000000", 10); // 1MB default

  try {
    const content = await execution.readTaskFile(task_id, file_path);
    const size = content.length;

    // Check size after reading (since we don't have a separate stat method)
    if (size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${file_path} (${size} bytes exceeds limit of ${MAX_FILE_SIZE} bytes). ` +
        `Configure MAX_TASK_FILE_SIZE environment variable to increase limit.`
      );
    }

    return {
      task_id,
      file_path,
      content,
      size,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
    throw error;
  }
}
