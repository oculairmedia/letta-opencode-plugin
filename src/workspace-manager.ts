import { LettaClient } from "./letta-client.js";
import type {
  WorkspaceBlock,
  WorkspaceEvent,
  WorkspaceArtifact,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
} from "./types/workspace.js";

const WORKSPACE_VERSION = "1.0.0";
const WORKSPACE_LABEL = "opencode_workspace";

export class WorkspaceManager {
  constructor(private letta: LettaClient) {}

  async createWorkspaceBlock(
    request: CreateWorkspaceRequest
  ): Promise<{ blockId: string; workspace: WorkspaceBlock }> {
    const workspace: WorkspaceBlock = {
      version: WORKSPACE_VERSION,
      task_id: request.task_id,
      agent_id: request.agent_id,
      status: "pending",
      created_at: Date.now(),
      updated_at: Date.now(),
      events: [],
      artifacts: [],
      metadata: request.metadata,
    };

    const blockLabel = `${WORKSPACE_LABEL}_${request.task_id}`;

    const block = await this.letta.createMemoryBlock(request.agent_id, {
      label: blockLabel,
      value: JSON.stringify(workspace),
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
    update: UpdateWorkspaceRequest
  ): Promise<WorkspaceBlock> {
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

    await this.letta.updateMemoryBlock(agentId, blockId, {
      value: JSON.stringify(workspace),
    });

    return workspace;
  }

  async appendEvent(
    agentId: string,
    blockId: string,
    event: WorkspaceEvent
  ): Promise<void> {
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

  async getWorkspace(
    agentId: string,
    blockId: string
  ): Promise<WorkspaceBlock> {
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

  async detachWorkspaceBlock(
    agentId: string,
    blockId: string
  ): Promise<void> {
    try {
      await this.letta.detachMemoryBlock(agentId, blockId);
    } catch (error) {
      console.error(
        `Failed to detach memory block ${blockId} from agent ${agentId}:`,
        error
      );
    }
  }
}
