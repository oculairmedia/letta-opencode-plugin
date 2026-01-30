import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { LettaClient } from '../../src/letta-client.js';

// Mock the SDK client
jest.mock('@letta-ai/letta-client', () => {
  return {
    LettaClient: jest.fn().mockImplementation(() => ({
      agents: {
        retrieve: jest.fn(),
        messages: {
          list: jest.fn(),
          create: jest.fn(),
        },
        blocks: {
          list: jest.fn(),
          attach: jest.fn(),
          detach: jest.fn(),
        },
      },
      blocks: {
        create: jest.fn(),
        modify: jest.fn(),
      },
    })),
  };
});

import { LettaClient as SDKLettaClient } from '@letta-ai/letta-client';

describe('LettaClient', () => {
  let client: LettaClient;
  let mockSDKClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    client = new LettaClient({
      baseUrl: 'https://api.example.com',
      token: 'test-key',
    });

    // Get the mock instance
    mockSDKClient = (SDKLettaClient as jest.Mock).mock.results[0]?.value;
  });

  describe('Agent Operations', () => {
    it('should get agent by ID', async () => {
      const mockAgent = { id: 'agent-123', name: 'Test Agent' };
      mockSDKClient.agents.retrieve.mockResolvedValueOnce(mockAgent);

      const agent = await client.getAgent('agent-123');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('agent-123');
      expect(mockSDKClient.agents.retrieve).toHaveBeenCalledWith(
        'agent-123',
        undefined,
        expect.objectContaining({
          timeoutInSeconds: 30,
          maxRetries: 3,
        })
      );
    });

    it('should throw error for non-existent agent', async () => {
      mockSDKClient.agents.retrieve.mockRejectedValueOnce(new Error('Agent not found'));

      await expect(client.getAgent('nonexistent')).rejects.toThrow('Agent not found');
    });

    it('should handle successful agent retrieval', async () => {
      const mockAgent = { id: 'agent-123', name: 'Test Agent' };
      mockSDKClient.agents.retrieve.mockResolvedValueOnce(mockAgent);

      const agent = await client.getAgent('agent-123');

      expect(agent.id).toBe('agent-123');
    });
  });

  describe('Memory Block Operations', () => {
    it('should list memory blocks', async () => {
      const mockBlocks = [
        { id: 'block-1', label: 'Block 1' },
        { id: 'block-2', label: 'Block 2' },
      ];
      mockSDKClient.agents.blocks.list.mockResolvedValueOnce(mockBlocks);

      const blocks = await client.listMemoryBlocks('agent-123');

      expect(blocks).toHaveLength(2);
      expect(mockSDKClient.agents.blocks.list).toHaveBeenCalledWith(
        'agent-123',
        undefined,
        expect.objectContaining({
          timeoutInSeconds: 30,
          maxRetries: 3,
        })
      );
    });

    it('should create memory block', async () => {
      const mockBlock = { id: 'block-new', label: 'New Block', value: 'test' };
      mockSDKClient.blocks.create.mockResolvedValueOnce(mockBlock);

      const block = await client.createMemoryBlock('agent-123', {
        label: 'New Block',
        value: 'test',
      });

      expect(block.id).toBe('block-new');
      expect(mockSDKClient.blocks.create).toHaveBeenCalled();
    });

    it('should update memory block', async () => {
      const mockBlock = { id: 'block-1', label: 'Block 1', value: 'updated' };
      mockSDKClient.blocks.modify.mockResolvedValueOnce(mockBlock);

      const block = await client.updateMemoryBlock('agent-123', 'block-1', {
        value: 'updated',
      });

      expect(block.value).toBe('updated');
      expect(mockSDKClient.blocks.modify).toHaveBeenCalledWith(
        'block-1',
        { value: 'updated' },
        expect.any(Object)
      );
    });

    it('should attach memory block', async () => {
      mockSDKClient.agents.blocks.attach.mockResolvedValueOnce(undefined);

      await client.attachMemoryBlock('agent-123', { block_id: 'block-1' });

      expect(mockSDKClient.agents.blocks.attach).toHaveBeenCalledWith(
        'agent-123',
        'block-1',
        expect.any(Object)
      );
    });

    it('should detach memory block', async () => {
      mockSDKClient.agents.blocks.detach.mockResolvedValueOnce(undefined);

      await client.detachMemoryBlock('agent-123', 'block-1');

      expect(mockSDKClient.agents.blocks.detach).toHaveBeenCalledWith(
        'agent-123',
        'block-1',
        expect.any(Object)
      );
    });
  });

  describe('Message Operations', () => {
    it('should list messages', async () => {
      const mockMessages = [
        { id: 'msg-1', content: 'Message 1' },
        { id: 'msg-2', content: 'Message 2' },
      ];
      mockSDKClient.agents.messages.list.mockResolvedValueOnce(mockMessages);

      const messages = await client.listMessages('agent-123');

      expect(messages).toHaveLength(2);
      expect(mockSDKClient.agents.messages.list).toHaveBeenCalledWith(
        'agent-123',
        { limit: 50 },
        expect.any(Object)
      );
    });

    it('should list messages with custom limit', async () => {
      const mockMessages = [{ id: 'msg-1', content: 'Message 1' }];
      mockSDKClient.agents.messages.list.mockResolvedValueOnce(mockMessages);

      await client.listMessages('agent-123', 10);

      expect(mockSDKClient.agents.messages.list).toHaveBeenCalledWith(
        'agent-123',
        { limit: 10 },
        expect.any(Object)
      );
    });

    it('should send message', async () => {
      const mockResponse = { id: 'msg-new', role: 'user', content: 'Hello' };
      mockSDKClient.agents.messages.create.mockResolvedValueOnce(mockResponse);

      const message = await client.sendMessage('agent-123', {
        role: 'user',
        content: 'Hello',
      });

      expect(message.id).toBe('msg-new');
      expect(mockSDKClient.agents.messages.create).toHaveBeenCalledWith(
        'agent-123',
        {
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            },
          ],
        },
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockSDKClient.agents.retrieve.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getAgent('agent-123')).rejects.toThrow('Network error');
    });

    it('should handle API errors', async () => {
      mockSDKClient.agents.retrieve.mockRejectedValueOnce(new Error('Internal Server Error'));

      await expect(client.getAgent('agent-123')).rejects.toThrow();
    });

    it('should propagate SDK errors', async () => {
      mockSDKClient.agents.retrieve.mockRejectedValueOnce(new Error('SDK Error: Invalid response'));

      await expect(client.getAgent('agent-123')).rejects.toThrow('SDK Error: Invalid response');
    });
  });

  describe('Configuration', () => {
    it('should use default timeout and retries', () => {
      const newClient = new LettaClient({
        baseUrl: 'https://api.example.com',
        token: 'test-key',
      });

      expect(SDKLettaClient).toHaveBeenCalledWith({
        baseUrl: 'https://api.example.com',
        token: 'test-key',
      });
    });

    it('should allow initialization with empty token', () => {
      expect(
        () =>
          new LettaClient({
            baseUrl: 'https://api.example.com',
            token: '',
          })
      ).not.toThrow();
    });

    it('should use custom timeout and retries', async () => {
      const customClient = new LettaClient({
        baseUrl: 'https://api.example.com',
        token: 'test-key',
        timeout: 60000,
        maxRetries: 5,
      });

      // Get the new mock instance
      const newMockSDKClient = (SDKLettaClient as jest.Mock).mock.results[
        (SDKLettaClient as jest.Mock).mock.results.length - 1
      ]?.value as any;
      newMockSDKClient.agents.retrieve.mockResolvedValueOnce({ id: 'agent-123' });

      await customClient.getAgent('agent-123');

      expect(newMockSDKClient.agents.retrieve).toHaveBeenCalledWith(
        'agent-123',
        undefined,
        expect.objectContaining({
          timeoutInSeconds: 60,
          maxRetries: 5,
        })
      );
    });
  });
});
