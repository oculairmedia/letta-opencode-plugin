import { spawn } from "child_process";
import type {
  ExecutionConfig,
  ExecutionRequest,
  ExecutionResult,
  ContainerInfo,
} from "./types/execution.js";
import { OpenCodeClientManager } from "./opencode-client-manager.js";
import type { OpenCodeEvent } from "./types/opencode.js";

export class ExecutionManager {
  private config: ExecutionConfig;
  private activeContainers: Map<string, ContainerInfo> = new Map();
  private openCodeClient?: OpenCodeClientManager;
  private eventHandlers: Map<
    string,
    (event: OpenCodeEvent) => void
  > = new Map();

  constructor(config: ExecutionConfig) {
    this.config = config;
    console.log(`[ExecutionManager] Initializing with openCodeServerEnabled=${config.openCodeServerEnabled}, url=${config.openCodeServerUrl}`);

    if (config.openCodeServerEnabled && config.openCodeServerUrl) {
      console.log(`[ExecutionManager] Creating OpenCodeClientManager`);
      this.openCodeClient = new OpenCodeClientManager({
        enabled: true,
        serverUrl: config.openCodeServerUrl,
        healthCheckIntervalMs: 5000,
        maxRetries: 3,
        retryDelayMs: 1000,
      });
      console.log(`[ExecutionManager] OpenCodeClientManager created`);
    } else {
      console.log(`[ExecutionManager] OpenCode server disabled, using Docker mode`);
    }
  }

  async execute(
    request: ExecutionRequest,
    onEvent?: (event: OpenCodeEvent) => void
  ): Promise<ExecutionResult> {
    if (this.config.openCodeServerEnabled && this.openCodeClient) {
      return this.executeWithOpenCodeServer(request, onEvent);
    } else {
      return this.executeWithDocker(request);
    }
  }

  private async executeWithOpenCodeServer(
    request: ExecutionRequest,
    onEvent?: (event: OpenCodeEvent) => void
  ): Promise<ExecutionResult> {
    if (!this.openCodeClient) {
      throw new Error("OpenCode client not initialized");
    }

    const startedAt = Date.now();
    const timeout = request.timeout || this.config.timeoutMs;

    try {
      const session = await this.openCodeClient.createSession(
        request.taskId,
        request.agentId,
        request.prompt
      );

      const containerInfo: ContainerInfo = {
        containerId: session.sessionId,
        taskId: request.taskId,
        startedAt,
        sessionId: session.sessionId,
        serverUrl: this.config.openCodeServerUrl,
      };

      this.activeContainers.set(request.taskId, containerInfo);

      let output = "";
      let error: string | undefined;
      let completed = false;
      let timedOut = false;

      const eventHandler = (event: OpenCodeEvent) => {
        if (onEvent) {
          onEvent(event);
        }

        switch (event.type) {
          case "output":
            output += String(event.data);
            break;
          case "error":
            error = String(event.data);
            break;
          case "complete":
            completed = true;
            break;
          case "abort":
            error = error || "Task aborted";
            completed = true;
            break;
        }
      };

      this.eventHandlers.set(request.taskId, eventHandler);

      this.openCodeClient.subscribeToEvents(
        session.sessionId,
        eventHandler,
        (err) => {
          error = err.message;
          completed = true;
        }
      );

      let timeoutHandle: NodeJS.Timeout | null = null;
      
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutHandle = setTimeout(() => {
          if (!completed) {
            timedOut = true;
            this.openCodeClient
              ?.abortSession(session.sessionId)
              .catch(console.error);
            resolve();
          }
        }, timeout);
      });

      const completionPromise = new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (completed) {
            clearInterval(checkInterval);
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
            }
            resolve();
          } else if (timedOut) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });

      await completionPromise;

      const result: ExecutionResult = {
        taskId: request.taskId,
        status: timedOut ? "timeout" : error ? "error" : "success",
        output: output || "Task completed",
        error: timedOut ? "Task execution timed out" : error,
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
      };

      return result;
    } finally {
      this.eventHandlers.delete(request.taskId);
      this.openCodeClient.removeSession(request.taskId);
      this.activeContainers.delete(request.taskId);
    }
  }

  private async executeWithDocker(
    request: ExecutionRequest
  ): Promise<ExecutionResult> {
    const startedAt = Date.now();
    const timeout = request.timeout || this.config.timeoutMs;
    const gracePeriod = this.config.gracePeriodMs || 5000;

    const containerId = `opencode-${request.taskId}-${Date.now()}`;
    const containerInfo: ContainerInfo = {
      containerId,
      taskId: request.taskId,
      startedAt,
    };

    this.activeContainers.set(request.taskId, containerInfo);

    try {
      const result = await this.runContainer(
        request,
        containerId,
        timeout,
        gracePeriod
      );
      return {
        ...result,
        taskId: request.taskId,
        startedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - startedAt,
      };
    } finally {
      this.activeContainers.delete(request.taskId);
    }
  }

  private async runContainer(
    request: ExecutionRequest,
    containerId: string,
    timeout: number,
    gracePeriod: number
  ): Promise<
    Omit<ExecutionResult, "taskId" | "startedAt" | "completedAt" | "durationMs">
  > {
    return new Promise((resolve) => {
      const workspaceDir = this.config.workspaceDir || "/opt/stacks";
      const taskWorkspace = `${workspaceDir}/${request.taskId}`;
      
      const dockerArgs = [
        "run",
        "--rm",
        "--name",
        containerId,
        "--label",
        `task_id=${request.taskId}`,
        "--label",
        `agent_id=${request.agentId}`,
        "-v",
        `${taskWorkspace}:/workspace`,
        "-w",
        "/workspace",
      ];

      if (this.config.cpuLimit) {
        dockerArgs.push("--cpus", this.config.cpuLimit);
      }

      if (this.config.memoryLimit) {
        dockerArgs.push("--memory", this.config.memoryLimit);
      }

      dockerArgs.push(
        this.config.image,
        "opencode",
        "run",
        request.prompt
      );

      const proc = spawn("docker", dockerArgs);

      let output = "";
      let errorOutput = "";
      let timeoutId: NodeJS.Timeout | null = null;
      let gracePeriodId: NodeJS.Timeout | null = null;
      let timedOut = false;

      proc.stdout.on("data", (data) => {
        const chunk = data.toString();
        output += chunk;
        if (output.length > 50000) {
          output = output.slice(-50000);
        }
      });

      proc.stderr.on("data", (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        if (errorOutput.length > 50000) {
          errorOutput = errorOutput.slice(-50000);
        }
      });

      timeoutId = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");

        gracePeriodId = setTimeout(() => {
          proc.kill("SIGKILL");
        }, gracePeriod);
      }, timeout);

      proc.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (gracePeriodId) clearTimeout(gracePeriodId);

        if (timedOut) {
          resolve({
            status: "timeout",
            exitCode: code ?? undefined,
            output: output || errorOutput,
            error: "Task execution timed out",
          });
        } else if (code === 0) {
          resolve({
            status: "success",
            exitCode: code,
            output: output || "Task completed successfully",
          });
        } else {
          resolve({
            status: "error",
            exitCode: code ?? undefined,
            output: output || errorOutput,
            error: errorOutput || `Process exited with code ${code}`,
          });
        }
      });

      proc.on("error", (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (gracePeriodId) clearTimeout(gracePeriodId);

        resolve({
          status: "error",
          output: output || errorOutput,
          error: `Failed to start container: ${err.message}`,
        });
      });
    });
  }

  async killTask(taskId: string): Promise<boolean> {
    const containerInfo = this.activeContainers.get(taskId);
    if (!containerInfo) {
      return false;
    }

    if (containerInfo.sessionId && this.openCodeClient) {
      try {
        await this.openCodeClient.abortSession(containerInfo.sessionId);
        return true;
      } catch (error) {
        console.error(`[ExecutionManager] Failed to abort session:`, error);
        return false;
      }
    }

    return new Promise((resolve) => {
      const proc = spawn("docker", ["kill", containerInfo.containerId]);
      proc.on("close", (code) => {
        resolve(code === 0);
      });
      proc.on("error", () => {
        resolve(false);
      });
    });
  }

  async pauseTask(taskId: string): Promise<boolean> {
    const containerInfo = this.activeContainers.get(taskId);
    if (!containerInfo) {
      return false;
    }

    if (containerInfo.sessionId) {
      console.warn(
        "[ExecutionManager] Pause not supported for OpenCode server sessions"
      );
      return false;
    }

    return new Promise((resolve) => {
      const proc = spawn("docker", ["pause", containerInfo.containerId]);
      proc.on("close", (code) => {
        resolve(code === 0);
      });
      proc.on("error", () => {
        resolve(false);
      });
    });
  }

  async resumeTask(taskId: string): Promise<boolean> {
    const containerInfo = this.activeContainers.get(taskId);
    if (!containerInfo) {
      return false;
    }

    if (containerInfo.sessionId) {
      console.warn(
        "[ExecutionManager] Resume not supported for OpenCode server sessions"
      );
      return false;
    }

    return new Promise((resolve) => {
      const proc = spawn("docker", ["unpause", containerInfo.containerId]);
      proc.on("close", (code) => {
        resolve(code === 0);
      });
      proc.on("error", () => {
        resolve(false);
      });
    });
  }

  async cancelTask(taskId: string): Promise<boolean> {
    return this.killTask(taskId);
  }

  getActiveTasks(): string[] {
    return Array.from(this.activeContainers.keys());
  }

  isTaskActive(taskId: string): boolean {
    return this.activeContainers.has(taskId);
  }

  getContainerInfo(taskId: string): ContainerInfo | undefined {
    return this.activeContainers.get(taskId);
  }

  async getTaskFiles(taskId: string): Promise<string[]> {
    const containerInfo = this.activeContainers.get(taskId);
    if (!containerInfo?.sessionId || !this.openCodeClient) {
      throw new Error("Task not found or not using OpenCode server");
    }

    return this.openCodeClient.listFiles(containerInfo.sessionId);
  }

  async readTaskFile(taskId: string, filePath: string): Promise<string> {
    const containerInfo = this.activeContainers.get(taskId);
    if (!containerInfo?.sessionId || !this.openCodeClient) {
      throw new Error("Task not found or not using OpenCode server");
    }

    return this.openCodeClient.readFile(containerInfo.sessionId, filePath);
  }

  cleanup(): void {
    this.openCodeClient?.cleanup();
    this.eventHandlers.clear();
    this.activeContainers.clear();
  }
}
