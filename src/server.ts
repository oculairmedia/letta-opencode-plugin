#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import dotenv from "dotenv";
import { LettaClient } from "./letta-client.js";
import { WorkspaceManager } from "./workspace-manager.js";
import { ExecutionManager } from "./execution-manager.js";
import { TaskRegistry } from "./task-registry.js";
import {
  executeTask,
  ExecuteTaskSchema,
  type ExecuteTaskParams,
} from "./tools/execute-task.js";
import { runHTTP } from "./http-transport.js";
import { MatrixClientWrapper } from "./matrix-client.js";
import { MatrixRoomManager } from "./matrix-room-manager.js";
import { MatrixMessageRouter } from "./matrix-message-router.js";
import { ControlSignalHandler } from "./control-signal-handler.js";
import {
  sendTaskControl,
  SendTaskControlSchema,
} from "./tools/task-coordination-tools.js";
import {
  sendTaskMessage,
  SendTaskMessageSchema,
} from "./tools/task-message-tools.js";
import {
  getTaskStatus,
  GetTaskStatusSchema,
} from "./tools/task-status-tools.js";
import {
  getTaskHistory,
  GetTaskHistorySchema,
} from "./tools/task-archive-tools.js";
import {
  getTaskFiles,
  GetTaskFilesSchema,
  readTaskFile,
  ReadTaskFileSchema,
} from "./tools/file-access-tools.js";

dotenv.config();

const DEBUG = process.env.DEBUG === "true";

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.error("[letta-opencode-plugin]", ...args);
  }
}

const letta = new LettaClient({
  baseUrl: process.env.LETTA_API_URL || "https://letta.oculair.ca",
  token: process.env.LETTA_API_TOKEN || "",
  timeout: 30000,
  maxRetries: 3,
});

const workspace = new WorkspaceManager(letta);

const execution = new ExecutionManager({
  image: process.env.RUNNER_IMAGE || "ghcr.io/anthropics/claude-code:latest",
  cpuLimit: process.env.RUNNER_CPU_LIMIT || "2.0",
  memoryLimit: process.env.RUNNER_MEMORY_LIMIT || "2g",
  timeoutMs: parseInt(process.env.RUNNER_TIMEOUT_MS || "300000", 10),
  gracePeriodMs: 5000,
  openCodeServerEnabled: process.env.OPENCODE_SERVER_ENABLED === "true",
  openCodeServerUrl: process.env.OPENCODE_SERVER_URL,
  workspaceDir: process.env.WORKSPACE_DIR || "/opt/stacks",
});

const registry = new TaskRegistry({
  maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || "3", 10),
  idempotencyWindowMs: 24 * 60 * 60 * 1000,
});

let matrixRoomManager: MatrixRoomManager | null = null;
let matrixMessageRouter: MatrixMessageRouter | null = null;
let controlSignalHandler: ControlSignalHandler | null = null;

if (process.env.MATRIX_ENABLED === "true") {
  const matrixClient = new MatrixClientWrapper({
    homeserverUrl: process.env.MATRIX_HOMESERVER_URL || "",
    accessToken: process.env.MATRIX_ACCESS_TOKEN || "",
    userId: process.env.MATRIX_USER_ID || "",
    storagePath: process.env.MATRIX_STORAGE_PATH,
  });
  
  matrixClient.start().then(() => {
    log("Matrix client started");
  }).catch((error) => {
    console.error("Failed to start Matrix client:", error);
  });
  
  matrixRoomManager = new MatrixRoomManager(matrixClient);
  
  controlSignalHandler = new ControlSignalHandler({
    execution,
    registry,
    workspace,
    matrix: matrixRoomManager,
  });
  
  matrixMessageRouter = new MatrixMessageRouter({
    matrix: matrixClient,
    rooms: matrixRoomManager,
    registry,
    workspace,
    controlHandler: controlSignalHandler,
  });
  matrixMessageRouter.start();
}

export function createMCPServer(deps: {
  letta: LettaClient;
  workspace: WorkspaceManager;
  execution: ExecutionManager;
  registry: TaskRegistry;
  matrix: MatrixRoomManager | null;
}): Server {
  const server = new Server(
    {
      name: "letta-opencode-plugin",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const PingSchema = z.object({});
  const HealthSchema = z.object({});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    {
      name: "ping",
      description: "Simple ping tool to verify the MCP server is responsive",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "health",
      description: "Health check tool that returns server status and environment info",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "opencode_execute_task",
      description:
        "Execute a development task using OpenCode. Returns task ID and status. " +
        "Use sync=true to wait for completion, or sync=false (default) to return immediately.",
      inputSchema: {
        type: "object",
        properties: {
          agent_id: {
            type: "string",
            description: "ID of the Letta agent requesting the task",
          },
          task_description: {
            type: "string",
            description: "Natural language description of the task to execute",
          },
          idempotency_key: {
            type: "string",
            description: "Optional key to prevent duplicate execution",
          },
          timeout_ms: {
            type: "number",
            description: "Optional task execution timeout in milliseconds",
          },
          sync: {
            type: "boolean",
            description:
              "If true, wait for task completion; if false, return immediately",
            default: false,
          },
          observers: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of Matrix user IDs to invite as observers (e.g., @user:domain.com)",
          },
        },
        required: ["agent_id", "task_description"],
      },
    },
    {
      name: "get_task_status",
      description:
        "Get the current status and recent activity of a task. " +
        "Returns task status, timestamps, and the 5 most recent events.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to check status for",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "send_task_message",
      description:
        "Send a message to a running task. Use this for updates, feedback, clarifications, " +
        "corrections, guidance, approvals, or context changes.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to send message to",
          },
          message: {
            type: "string",
            description: "Message content",
          },
          message_type: {
            type: "string",
            description: "Type of message",
            enum: [
              "update",
              "feedback",
              "context_change",
              "requirement_change",
              "priority_change",
              "clarification",
              "correction",
              "guidance",
              "approval",
            ],
            default: "update",
          },
          metadata: {
            type: "object",
            description: "Optional additional metadata",
          },
        },
        required: ["task_id", "message"],
      },
    },
    {
      name: "send_task_control",
      description:
        "Send a control signal to cancel, pause, or resume task execution.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to control",
          },
          control: {
            type: "string",
            description: "Control action",
            enum: ["cancel", "pause", "resume"],
          },
          reason: {
            type: "string",
            description: "Optional explanation for the control signal",
          },
        },
        required: ["task_id", "control"],
      },
    },
    {
      name: "get_task_history",
      description:
        "Retrieve the complete history of events and optionally artifacts for a completed task.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to retrieve history for",
          },
          include_artifacts: {
            type: "boolean",
            description: "Whether to include artifacts (files, outputs) in the response",
            default: false,
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "get_task_files",
      description:
        "List files that have been created or modified in a running task's workspace. " +
        "Only available when using OpenCode server mode.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to list files for",
          },
          path: {
            type: "string",
            description: "Optional path filter (default: / for root)",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "read_task_file",
      description:
        "Read the content of a file from a running task's workspace. " +
        "Only available when using OpenCode server mode.",
      inputSchema: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task ID to read file from",
          },
          file_path: {
            type: "string",
            description: "Path to the file to read",
          },
        },
        required: ["task_id", "file_path"],
      },
    },
  ];

  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "ping") {
      PingSchema.parse(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "ok", timestamp: Date.now() }),
          },
        ],
      };
    }

    if (name === "health") {
      HealthSchema.parse(args);
      const health = {
        status: "healthy",
        timestamp: Date.now(),
        version: "0.1.0",
        environment: {
          letta_api_url: process.env.LETTA_API_URL || "not_configured",
          runner_image: process.env.RUNNER_IMAGE || "not_configured",
          mcp_port: process.env.MCP_PORT || "not_configured",
        },
        metrics: {
          active_tasks: deps.registry.getRunningTasksCount(),
          can_accept_task: deps.registry.canAcceptTask(),
        },
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(health, null, 2),
          },
        ],
      };
    }

    if (name === "opencode_execute_task") {
      const params = ExecuteTaskSchema.parse(args) as ExecuteTaskParams;
      const result = await executeTask(params, {
        letta: deps.letta,
        workspace: deps.workspace,
        execution: deps.execution,
        registry: deps.registry,
        matrix: deps.matrix,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "get_task_status") {
      const params = GetTaskStatusSchema.parse(args);
      const result = await getTaskStatus(params, {
        registry: deps.registry,
        workspace: deps.workspace,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "send_task_message") {
      const params = SendTaskMessageSchema.parse(args);
      const result = await sendTaskMessage(params, {
        registry: deps.registry,
        workspace: deps.workspace,
        matrix: deps.matrix,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "send_task_control") {
      const params = SendTaskControlSchema.parse(args);
      const result = await sendTaskControl(params, {
        registry: deps.registry,
        matrix: deps.matrix,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "get_task_history") {
      const params = GetTaskHistorySchema.parse(args);
      const result = await getTaskHistory(params, {
        registry: deps.registry,
        workspace: deps.workspace,
        matrix: deps.matrix,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "get_task_files") {
      const params = GetTaskFilesSchema.parse(args);
      const result = await getTaskFiles(params, {
        execution: deps.execution,
        registry: deps.registry,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    if (name === "read_task_file") {
      const params = ReadTaskFileSchema.parse(args);
      const result = await readTaskFile(params, {
        execution: deps.execution,
        registry: deps.registry,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: `Unknown tool: ${name}` }),
        },
      ],
      isError: true,
    };
  } catch (error) {
    log("Error handling tool call:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

  return server;
}

async function main() {
  log("Starting Letta OpenCode Plugin MCP Server...");
  const server = createMCPServer({
    letta,
    workspace,
    execution,
    registry,
    matrix: matrixRoomManager,
  });
  await runHTTP(server);
  log("Server connected and ready");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  if (matrixMessageRouter) {
    matrixMessageRouter.stop();
  }
  if (matrixRoomManager) {
    void matrixRoomManager
      .getMatrixClient()
      .stop()
      .catch((stopError) => console.error("Failed to stop Matrix client:", stopError));
  }
  process.exit(1);
});
