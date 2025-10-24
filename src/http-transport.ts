import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

const DEBUG = process.env.DEBUG === 'true';

// Supported MCP protocol versions
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'];

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[http-transport]', ...args);
  }
}

class InMemoryEventStore {
  private events: Map<
    string,
    { streamId: string; message: unknown; timestamp: number }
  > = new Map();
  private readonly maxAge: number = 3600000; // 1 hour
  private readonly maxEventsPerStream: number = 1000;

  generateEventId(streamId: string): string {
    return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  getStreamIdFromEventId(eventId: string): string {
    const parts = eventId.split('_');
    return parts.length > 0 ? parts[0] : '';
  }

  async storeEvent(streamId: string, message: unknown): Promise<string> {
    const eventId = this.generateEventId(streamId);
    this.events.set(eventId, {
      streamId,
      message,
      timestamp: Date.now(),
    });
    this.cleanupOldEvents();
    return eventId;
  }

  private cleanupOldEvents(): void {
    const now = Date.now();
    const streamEventCounts = new Map<string, number>();

    // Count events per stream and remove old ones
    for (const [eventId, event] of this.events.entries()) {
      if (now - event.timestamp > this.maxAge) {
        this.events.delete(eventId);
        continue;
      }

      const count = streamEventCounts.get(event.streamId) || 0;
      streamEventCounts.set(event.streamId, count + 1);
    }

    // Enforce per-stream limits by removing oldest events
    for (const [streamId, count] of streamEventCounts.entries()) {
      if (count > this.maxEventsPerStream) {
        const streamEvents = [...this.events.entries()]
          .filter(([, event]) => event.streamId === streamId)
          .sort((a, b) => a[1].timestamp - b[1].timestamp);

        const toRemove = count - this.maxEventsPerStream;
        for (let i = 0; i < toRemove; i++) {
          this.events.delete(streamEvents[i][0]);
        }
      }
    }
  }

  getEventCount(): number {
    return this.events.size;
  }

  async replayEventsAfter(
    lastEventId: string,
    { send }: { send: (eventId: string, message: unknown) => Promise<void> }
  ): Promise<string> {
    if (!lastEventId || !this.events.has(lastEventId)) {
      return '';
    }

    const streamId = this.getStreamIdFromEventId(lastEventId);
    if (!streamId) {
      return '';
    }

    let foundLastEvent = false;

    const sortedEvents = [...this.events.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [eventId, { streamId: eventStreamId, message }] of sortedEvents) {
      if (eventStreamId !== streamId) {
        continue;
      }

      if (eventId === lastEventId) {
        foundLastEvent = true;
        continue;
      }

      if (foundLastEvent) {
        await send(eventId, message);
      }
    }
    return streamId;
  }
}

export interface HTTPServerHandle {
  httpServer: ReturnType<express.Application['listen']>;
  shutdown: () => Promise<void>;
}

export async function runHTTP(server: Server): Promise<HTTPServerHandle> {
  const app = express();
  const transports: Record<string, StreamableHTTPServerTransport> = {};
  const eventStores = new Map<string, InMemoryEventStore>();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost',
      'http://127.0.0.1',
      'http://192.168.50.90',
      'https://letta.oculair.ca',
      'https://letta2.oculair.ca',
    ];

    if (origin && !allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
      log(`Blocked request from unauthorized origin: ${origin}`);
      return res.status(403).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Forbidden: Invalid origin',
        },
        id: null,
      });
    }
    next();
  });

  app.use(
    cors({
      origin: [
        'http://localhost',
        'http://127.0.0.1',
        'http://192.168.50.90',
        'https://letta.oculair.ca',
        'https://letta2.oculair.ca',
      ],
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const agentId = req.headers['x-agent-id'];
    const logMessage = agentId
      ? `${req.method} ${req.path} - ${req.ip} (agent: ${agentId})`
      : `${req.method} ${req.path} - ${req.ip}`;
    log(logMessage);
    next();
  });

  app.use('/mcp', (req, res, next) => {
    if (req.method === 'POST' && req.body && req.body.method === 'initialize') {
      return next();
    }

    const protocolVersion = req.headers['mcp-protocol-version'];
    if (protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion as string)) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: `Unsupported MCP protocol version: ${protocolVersion}. Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`,
        },
        id: null,
      });
    }
    next();
  });

  app.post('/mcp', async (req, res) => {
    log('Received MCP request:', req.body);
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const agentIdHeader = req.headers['x-agent-id'] as string | undefined;
      
      if (req.body?.method === 'tools/call' && agentIdHeader) {
        const args = req.body.params?.arguments || {};
        if (!args.agent_id) {
          req.body.params.arguments = { ...args, agent_id: agentIdHeader };
          log(`Injected agent_id from x-agent-id header: ${agentIdHeader}`);
        }
      }
      
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sessionId: string) => {
            log(`Session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport as StreamableHTTPServerTransport;
            eventStores.set(sessionId, eventStore);
          },
        });

        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid && transports[sid]) {
            log(`Transport closed for session ${sid}, removing from transports map`);
            delete transports[sid];
            eventStores.delete(sid);
          }
        };

        await server.connect(transport);

        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
      return res.status(400).send('Session ID required');
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No session ID provided',
        },
      });
    }

    if (!transports[sessionId]) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session not found',
        },
      });
    }

    try {
      const transport = transports[sessionId];
      if (transport.onclose) {
        transport.onclose();
      }
      delete transports[sessionId];

      log(`Session ${sessionId} terminated by client`);
      res.status(200).json({
        jsonrpc: '2.0',
        result: { terminated: true },
      });
    } catch (error) {
      log(`Error terminating session ${sessionId}:`, error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error during session termination',
        },
      });
    }
  });

  const PORT = parseInt(process.env.MCP_PORT || '3456', 10);
  const HOST = process.env.MCP_HOST || '127.0.0.1';

  app.get('/health', (req, res) => {
    const memUsage = process.memoryUsage();
    const totalEvents = Array.from(eventStores.values()).reduce(
      (sum, store) => sum + store.getEventCount(),
      0
    );

    res.json({
      status: 'healthy',
      service: 'letta-opencode-plugin',
      transport: 'streamable_http',
      protocol_version: SUPPORTED_PROTOCOL_VERSIONS[0],
      supported_versions: SUPPORTED_PROTOCOL_VERSIONS,
      sessions: Object.keys(transports).length,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      },
      eventStore: {
        totalEvents,
        sessionsWithEvents: eventStores.size,
      },
      security: {
        origin_validation: true,
        localhost_binding: HOST === '127.0.0.1' || HOST === 'localhost',
        bound_host: HOST,
      },
    });
  });

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Letta OpenCode Plugin HTTP server is running on ${HOST}:${PORT}`);
    console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Protocol versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`);
    console.log(`Security: Origin validation enabled, localhost binding (${HOST}), DNS rebinding protection active`);
  });

  const shutdownHandler = async () => {
    log('Shutting down HTTP server...');

    return new Promise<void>((resolve) => {
      httpServer.close(() => {
        log('HTTP server closed');
        resolve();
      });
    }).then(async () => {
      for (const [sessionId, transport] of Object.entries(transports)) {
        try {
          log(`Cleaning up session: ${sessionId}`);
          if (transport.onclose) {
            transport.onclose();
          }
        } catch (error) {
          log(`Error cleaning up session ${sessionId}:`, error);
        }
      }

      await server.close();
      if (process.env.NODE_ENV !== 'test') {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  return {
    httpServer,
    shutdown: shutdownHandler,
  };
}
