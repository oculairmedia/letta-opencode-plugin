import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { LettaClient } from "../../src/letta-client.js";

global.fetch = jest.fn() as any;

describe("LettaClient", () => {
  let client: LettaClient;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    client = new LettaClient({
      baseUrl: "https://api.example.com",
      token: "test-key",
    });

    mockFetch.mockReset();
  });

  describe("Agent Operations", () => {
    it("should get agent by ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "agent-123",
          name: "Test Agent",
        }),
      } as Response);

      const agent = await client.getAgent("agent-123");

      expect(agent).toBeDefined();
      expect(agent?.id).toBe("agent-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/v1/agents/agent-123",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        })
      );
    });

    it("should throw error for non-existent agent", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as any);

      await expect(client.getAgent("nonexistent")).rejects.toThrow("HTTP 404: Not Found");
    });

    it("should handle successful agent retrieval", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "agent-123", name: "Test Agent" }),
      } as any);

      const agent = await client.getAgent("agent-123");

      expect(agent.id).toBe("agent-123");
    });
  });

  describe("Memory Block Operations", () => {
    it("should list memory blocks", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "block-1", label: "Block 1" },
          { id: "block-2", label: "Block 2" },
        ],
      } as any);

      const blocks = await client.listMemoryBlocks("agent-123");

      expect(blocks).toHaveLength(2);
    });
  });

  describe("Message Operations", () => {
    it("should list messages", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "msg-1", content: "Message 1" },
          { id: "msg-2", content: "Message 2" },
        ],
      } as any);

      const messages = await client.listMessages("agent-123");

      expect(messages).toHaveLength(2);
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.getAgent("agent-123")).rejects.toThrow(
        "Network error"
      );
    });

    it("should handle API errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as any);

      await expect(client.getAgent("agent-123")).rejects.toThrow();
    });

    it("should handle invalid JSON responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      } as any);

      await expect(client.getAgent("agent-123")).rejects.toThrow(
        "Invalid JSON"
      );
    });

    it("should validate required parameters", async () => {
      await expect(client.getAgent("")).rejects.toThrow();
    });
  });

  describe("Authentication", () => {
    it("should include API key in requests", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "agent-123" }),
      } as any);

      await client.getAgent("agent-123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        })
      );
    });

    it("should allow initialization with empty token", () => {
      expect(
        () =>
          new LettaClient({
            baseUrl: "https://api.example.com",
            token: "",
          })
      ).not.toThrow();
    });
  });

  describe("Request Configuration", () => {
    it("should include authorization header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "agent-123" }),
      } as any);

      await client.getAgent("agent-123");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        })
      );
    });
  });
});
