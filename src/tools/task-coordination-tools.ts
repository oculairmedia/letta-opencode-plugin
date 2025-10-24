import { z } from "zod";
import type { MatrixRoomManager } from "../matrix-room-manager.js";
import { TaskRegistry } from "../task-registry.js";
import type { TaskRegistryEntry } from "../types/task.js";

export const ListTaskChannelsSchema = z.object({
  agent_id: z.string().optional(),
  include_completed: z.boolean().optional().default(false),
});

export type ListTaskChannelsParams = z.infer<typeof ListTaskChannelsSchema>;

const TaskChannelSummarySchema = z.object({
  task_id: z.string(),
  status: z.string(),
  channel_id: z.string(),
  created_at: z.number(),
  workspace_block_id: z.string().optional(),
  participants: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        role: z.string(),
        invited_at: z.number(),
      })
    )
    .optional(),
});

export type TaskChannelSummary = z.infer<typeof TaskChannelSummarySchema>;

export const GetTaskChannelSchema = z
  .object({
    task_id: z.string().optional(),
    channel_id: z.string().optional(),
  })
  .refine((value) => Boolean(value.task_id || value.channel_id), {
    message: "task_id or channel_id is required",
  });

export type GetTaskChannelParams = z.infer<typeof GetTaskChannelSchema>;

export const SendTaskUpdateSchema = z.object({
  task_id: z.string(),
  message: z.string(),
  event_type: z.enum(["progress", "error", "status_change"]).default("progress"),
});

export type SendTaskUpdateParams = z.infer<typeof SendTaskUpdateSchema>;

export const SendTaskControlSchema = z.object({
  task_id: z.string(),
  control: z.enum(["cancel", "pause", "resume"]),
  reason: z.string().optional(),
});

export type SendTaskControlParams = z.infer<typeof SendTaskControlSchema>;

export interface TaskCoordinationDependencies {
  registry: TaskRegistry;
  matrix?: MatrixRoomManager | null;
}

function ensureCoordination(deps: TaskCoordinationDependencies): MatrixRoomManager {
  if (!deps.matrix) {
    throw new Error("Task coordination is not enabled for this deployment");
  }
  return deps.matrix;
}

function mapTaskToSummary(entry: TaskRegistryEntry): TaskChannelSummary | null {
  if (!entry.matrixRoom) {
    return null;
  }

  return {
    task_id: entry.taskId,
    status: entry.status,
    channel_id: entry.matrixRoom.roomId,
    created_at: entry.matrixRoom.createdAt,
    workspace_block_id: entry.workspaceBlockId,
    participants: entry.matrixRoom.participants?.map((participant) => ({
      id: participant.id,
      type: participant.type,
      role: participant.role,
      invited_at: participant.invitedAt,
    })),
  };
}

export async function listTaskChannels(
  params: ListTaskChannelsParams,
  deps: TaskCoordinationDependencies
): Promise<{ channels: TaskChannelSummary[]; total: number }> {
  ensureCoordination(deps);

  const tasks = params.agent_id
    ? deps.registry.findTasksByAgent(params.agent_id)
    : deps.registry.getAllTasks();

  const channels = tasks
    .filter((task) => {
      if (!task.matrixRoom) {
        return false;
      }
      if (params.include_completed) {
        return true;
      }
      return task.status === "queued" || task.status === "running";
    })
    .map((task) => mapTaskToSummary(task))
    .filter((summary): summary is TaskChannelSummary => summary !== null);

  return {
    channels,
    total: channels.length,
  };
}

export async function getTaskChannel(
  params: GetTaskChannelParams,
  deps: TaskCoordinationDependencies
): Promise<{ channel: TaskChannelSummary }> {
  ensureCoordination(deps);

  let task: TaskRegistryEntry | undefined;

  if (params.task_id) {
    task = deps.registry.getTask(params.task_id);
  }

  if (!task && params.channel_id) {
    task = deps.registry.findTaskByMatrixRoom(params.channel_id);
  }

  if (!task || !task.matrixRoom) {
    throw new Error("Task communication channel not found for the specified task or channel id");
  }

  const summary = mapTaskToSummary(task);
  if (!summary) {
    throw new Error("Failed to construct task channel summary");
  }

  return {
    channel: summary,
  };
}

export async function sendTaskUpdate(
  params: SendTaskUpdateParams,
  deps: TaskCoordinationDependencies
): Promise<{ channel_id: string; task_id: string }> {
  const coordinator = ensureCoordination(deps);

  const task = deps.registry.getTask(params.task_id);
  if (!task || !task.matrixRoom) {
    throw new Error("Task does not have an associated communication channel");
  }

  await coordinator.sendTaskUpdate(
    task.matrixRoom.roomId,
    task.taskId,
    params.message,
    params.event_type
  );

  return {
    channel_id: task.matrixRoom.roomId,
    task_id: task.taskId,
  };
}

export async function sendTaskControl(
  params: SendTaskControlParams,
  deps: TaskCoordinationDependencies
): Promise<{ channel_id: string; task_id: string; control: string }> {
  const coordinator = ensureCoordination(deps);

  const task = deps.registry.getTask(params.task_id);
  if (!task || !task.matrixRoom) {
    throw new Error("Task does not have an associated communication channel");
  }

  await coordinator.sendControlSignal(
    task.matrixRoom.roomId,
    task.taskId,
    params.control,
    params.reason
  );

  return {
    channel_id: task.matrixRoom.roomId,
    task_id: task.taskId,
    control: params.control,
  };
}
