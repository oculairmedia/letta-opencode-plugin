import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { runHTTP, HTTPServerHandle } from '../../src/http-transport.js';

describe('HTTP Transport Simple Test', () => {
  let server: Server;
  let serverHandle: HTTPServerHandle;
  const serverPort = 13457;

  beforeAll(async () => {
    server = new Server(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{ name: 'test', description: 'test', inputSchema: { type: 'object', properties: {} } }],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => ({
      content: [{ type: 'text', text: JSON.stringify({ result: 'ok', args: req.params.arguments }) }],
    }));

    process.env.MCP_PORT = String(serverPort);
    process.env.MCP_HOST = '127.0.0.1';
    process.env.NODE_ENV = 'test';

    serverHandle = await runHTTP(server);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (serverHandle) {
      await serverHandle.shutdown();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it('should respond to health check', async () => {
    const response = await fetch(`http://127.0.0.1:${serverPort}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('should initialize session', async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${serverPort}/mcp`, {
        method: 'POST',
        headers: {
          'Origin': 'http://localhost',
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
          id: 1,
        }),
      });

      console.log('Initialize response status:', response.status);
      console.log('Initialize response headers:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('Initialize response body:', responseText);

      expect(response.status).toBe(200);
      expect(response.headers.get('mcp-session-id')).toBeDefined();

      // Parse SSE format: "data: <json>\n"
      const dataMatch = responseText.match(/data: (.+)/);
      expect(dataMatch).toBeTruthy();

      const data = JSON.parse(dataMatch![1]);
      console.log('Parsed data:', JSON.stringify(data, null, 2));

      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(1);
      expect(data.result).toBeDefined();
      expect(data.result.serverInfo.name).toBe('test-server');
    } catch (error: any) {
      console.error('Initialize error:', error.message);
      throw error;
    }
  });
});
