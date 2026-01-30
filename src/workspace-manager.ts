import { LettaClient } from './letta-client.js';
import type {
  WorkspaceBlock,
  WorkspaceEvent,
  WorkspaceArtifact,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
} from './types/workspace.js';

const WORKSPACE_VERSION = '1.0.0';
const WORKSPACE_LABEL = 'opencode_workspace';
const DEFAULT_MAX_EVENTS = 50;

export class WorkspaceManager {
  private maxEvents: number;

  constructor(private letta: LettaClient) {
    this.maxEvents = parseInt(process.env.WORKSPACE_MAX_EVENTS || String(DEFAULT_MAX_EVENTS), 10);
  }

  private pruneEvents(workspace: WorkspaceBlock): WorkspaceBlock {
    if (workspace.events.length <= this.maxEvents) {
      return workspace;
    }

    const pruned = workspace.events.length - this.maxEvents;
    const recentEvents = workspace.events.slice(-this.maxEvents);

    return {
      ...workspace,
      events: [
        {
          timestamp: Date.now(),
          type: 'task_progress',
          message: `[System: Pruned ${pruned} older events to stay within ${this.maxEvents} event limit]`,
        },
        ...recentEvents,
      ],
    };
  }

  async createWorkspaceBlock(
    request: CreateWorkspaceRequest
  ): Promise<{ blockId: string; workspace: WorkspaceBlock }> {
    const workspace: WorkspaceBlock = {
      version: WORKSPACE_VERSION,
      task_id: request.task_id,
      agent_id: request.agent_id,
      status: 'pending',
      created_at: Date.now(),
      updated_at: Date.now(),
      events: [],
      artifacts: [],
      metadata: request.metadata,
    };

    const blockLabel = `${WORKSPACE_LABEL}_${request.task_id}`;

    const block = await this.letta.createMemoryBlock(request.agent_id, {
      label: blockLabel,
      description:
        "OpenCode task execution workspace. Monitor 'status' field for current state (pending/running/completed/failed/timeout). The 'events' array contains chronological task progress (most recent last). The 'artifacts' array contains task outputs. Check 'updated_at' to see when last modified.",
      value: JSON.stringify(workspace),
      limit: parseInt(process.env.WORKSPACE_BLOCK_LIMIT || '50000', 10),
    });

    try {
      await this.letta.attachMemoryBlock(request.agent_id, {
        block_id: block.id,
      });
      console.log(
        `Successfully attached memory block ${block.id} to agent ${request.agent_id} with label ${blockLabel}`
      );
    } catch (error) {
      console.error(
        `Failed to attach memory block ${block.id} to agent ${request.agent_id}:`,
        error
      );
      throw error;
    }

    return { blockId: block.id, workspace };
  }

  async updateWorkspace(
    agentId: string,
    blockId: string,
    update: UpdateWorkspaceRequest,
    retries = 3
  ): Promise<WorkspaceBlock> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const blocks = await this.letta.listMemoryBlocks(agentId);
        const currentBlock = blocks.find((b) => b.id === blockId);

        if (!currentBlock) {
          throw new Error(`Workspace block ${blockId} not found`);
        }

        const workspace: WorkspaceBlock = JSON.parse(currentBlock.value);

        if (update.status) {
          workspace.status = update.status;
        }

        if (update.events) {
          workspace.events.push(...update.events);
        }

        if (update.artifacts) {
          workspace.artifacts.push(...update.artifacts);
        }

        if (update.metadata) {
          workspace.metadata = { ...workspace.metadata, ...update.metadata };
        }

        workspace.updated_at = Date.now();

        const prunedWorkspace = this.pruneEvents(workspace);

        const serialized = JSON.stringify(prunedWorkspace);
        const blockLimit = parseInt(process.env.WORKSPACE_BLOCK_LIMIT || '50000', 10);

        if (serialized.length > blockLimit) {
          console.warn(
            `[workspace-manager] Workspace block ${blockId} exceeds limit: ${serialized.length} > ${blockLimit} chars`
          );
        }

        await this.letta.updateMemoryBlock(agentId, blockId, {
          value: serialized,
        });

        return prunedWorkspace;
      } catch (error) {
        const is409 =
          error instanceof Error &&
          (error.message.includes('409') || error.message.includes('CONFLICT'));
        if (is409 && attempt < retries) {
          const delay = 100 * Math.pow(2, attempt) + Math.random() * 50;
          console.warn(
            `[workspace-manager] 409 conflict on block ${blockId}, retry ${attempt + 1}/${retries} in ${Math.round(delay)}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Failed to update workspace block ${blockId} after ${retries} retries`);
  }

  async appendEvent(agentId: string, blockId: string, event: WorkspaceEvent): Promise<void> {
    await this.updateWorkspace(agentId, blockId, {
      events: [event],
    });
  }

  async recordArtifact(
    agentId: string,
    blockId: string,
    artifact: WorkspaceArtifact
  ): Promise<void> {
    await this.updateWorkspace(agentId, blockId, {
      artifacts: [artifact],
    });
  }

  async getWorkspace(agentId: string, blockId: string): Promise<WorkspaceBlock> {
    const blocks = await this.letta.listMemoryBlocks(agentId);
    const block = blocks.find((b) => b.id === blockId);

    if (!block) {
      throw new Error(`Workspace block ${blockId} not found`);
    }

    return JSON.parse(block.value);
  }

  async findWorkspaceByTaskId(
    agentId: string,
    taskId: string
  ): Promise<{ blockId: string; workspace: WorkspaceBlock } | null> {
    const blocks = await this.letta.listMemoryBlocks(agentId);

    for (const block of blocks) {
      if (block.label === `${WORKSPACE_LABEL}_${taskId}` || block.label === WORKSPACE_LABEL) {
        try {
          const workspace: WorkspaceBlock = JSON.parse(block.value);
          if (workspace.task_id === taskId) {
            return { blockId: block.id, workspace };
          }
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  async detachWorkspaceBlock(agentId: string, blockId: string): Promise<void> {
    try {
      await this.letta.detachMemoryBlock(agentId, blockId);
    } catch (error) {
      console.error(`Failed to detach memory block ${blockId} from agent ${agentId}:`, error);
    }
  }
}
