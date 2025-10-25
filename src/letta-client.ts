import { LettaClient as SDKLettaClient } from "@letta-ai/letta-client";
import type {
  LettaConfig,
  LettaAgent,
  LettaMessage,
  LettaMemoryBlock,
  CreateMemoryBlockRequest,
  UpdateMemoryBlockRequest,
  AttachMemoryBlockRequest,
  SendMessageRequest,
} from "./types/letta.js";

export class LettaClient {
  private client: SDKLettaClient;
  private timeout: number;
  private maxRetries: number;

  constructor(config: LettaConfig) {
    this.client = new SDKLettaClient({
      baseUrl: config.baseUrl,
      token: config.token,
    });
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
  }

  async getAgent(agentId: string): Promise<LettaAgent> {
    const agent = await this.client.agents.retrieve(agentId, undefined, {
      timeoutInSeconds: this.timeout / 1000,
      maxRetries: this.maxRetries,
    });
    return agent as unknown as LettaAgent;
  }

  async listMessages(agentId: string, limit = 50): Promise<LettaMessage[]> {
    const messages = await this.client.agents.messages.list(
      agentId,
      { limit },
      {
        timeoutInSeconds: this.timeout / 1000,
        maxRetries: this.maxRetries,
      }
    );
    return messages as unknown as LettaMessage[];
  }

  async sendMessage(
    agentId: string,
    request: SendMessageRequest
  ): Promise<LettaMessage> {
    const response = await this.client.agents.messages.create(
      agentId,
      {
        messages: [
          {
            role: request.role,
            content: [{ type: "text", text: request.content }],
          },
        ],
      },
      {
        timeoutInSeconds: this.timeout / 1000,
        maxRetries: this.maxRetries,
      }
    );
    return response as unknown as LettaMessage;
  }

  async createMemoryBlock(
    agentId: string,
    request: CreateMemoryBlockRequest
  ): Promise<LettaMemoryBlock> {
    console.log(`[letta-client] Creating memory block for agent ${agentId}: ${request.label}`);
    const block = await this.client.blocks.create(
      {
        label: request.label,
        description: request.description,
        value: request.value,
        limit: request.limit,
      },
      {
        timeoutInSeconds: this.timeout / 1000,
        maxRetries: this.maxRetries,
      }
    );
    return block as unknown as LettaMemoryBlock;
  }

  async updateMemoryBlock(
    agentId: string,
    blockId: string,
    request: UpdateMemoryBlockRequest
  ): Promise<LettaMemoryBlock> {
    console.log(`[letta-client] Updating memory block ${blockId} for agent ${agentId}`);
    const block = await this.client.blocks.modify(
      blockId,
      {
        value: request.value,
      },
      {
        timeoutInSeconds: this.timeout / 1000,
        maxRetries: this.maxRetries,
      }
    );
    return block as unknown as LettaMemoryBlock;
  }

  async attachMemoryBlock(
    agentId: string,
    request: AttachMemoryBlockRequest
  ): Promise<void> {
    await this.client.agents.blocks.attach(agentId, request.block_id, {
      timeoutInSeconds: this.timeout / 1000,
      maxRetries: this.maxRetries,
    });
  }

  async detachMemoryBlock(agentId: string, blockId: string): Promise<void> {
    await this.client.agents.blocks.detach(agentId, blockId, {
      timeoutInSeconds: this.timeout / 1000,
      maxRetries: this.maxRetries,
    });
  }

  async listMemoryBlocks(agentId: string): Promise<LettaMemoryBlock[]> {
    const blocks = await this.client.agents.blocks.list(
      agentId,
      undefined,
      {
        timeoutInSeconds: this.timeout / 1000,
        maxRetries: this.maxRetries,
      }
    );
    return blocks as unknown as LettaMemoryBlock[];
  }
}
