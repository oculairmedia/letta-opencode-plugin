# OpenCode Server Mode

## Overview

The Letta OpenCode Plugin now fully supports **OpenCode Server Mode**, which provides a persistent HTTP API for interacting with OpenCode sessions programmatically using the official `@opencode-ai/sdk`.

## Architecture

```
Letta Agent → MCP Server → OpenCode SDK → OpenCode Server (HTTP) → OpenCode CLI
```

### Components

1. **OpenCode Server**: Headless HTTP server running `opencode serve`
2. **OpenCode SDK**: Official TypeScript SDK (`@opencode-ai/sdk`)
3. **MCP Server**: Uses SDK to create sessions, send prompts, handle events
4. **Matrix Plugin**: Custom OpenCode plugin for notifications

## Server Endpoints

OpenCode server exposes OpenAPI 3.1 endpoints at `http://opencode-server:3100`:

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Get configuration (health check) |
| GET | `/session` | List all sessions |
| POST | `/session` | Create new session |
| GET | `/session/:id` | Get session details |
| POST | `/session/:id/message` | Send message to session |
| DELETE | `/session/:id` | Delete session |
| GET | `/event` | Server-sent events stream |
| GET | `/file?path=<path>` | Read file from workspace |
| GET | `/file/status` | Get tracked file statuses |
| GET | `/doc` | OpenAPI specification |

## Configuration

### Environment Variables

```bash
# Enable server mode
OPENCODE_SERVER_ENABLED=true

# Server URL
OPENCODE_SERVER_URL=http://opencode-server:3100

# Health check settings
OPENCODE_SERVER_HEALTH_CHECK_INTERVAL_MS=5000
OPENCODE_SERVER_MAX_RETRIES=3
OPENCODE_SERVER_RETRY_DELAY_MS=1000
```

### Docker Compose

```yaml
services:
  opencode-server:
    build:
      context: .
      dockerfile: Dockerfile.opencode
    ports:
      - "3100:3100"
    environment:
      - MATRIX_API_URL=http://letta-opencode-plugin:3500/matrix
    volumes:
      - opencode-workspaces:/workspace
      - ./.opencode/plugin:/root/.config/opencode/plugin:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3100/config"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - letta-network
```

## OpenCode SDK Usage

### Client Initialization

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk";

const client = createOpencodeClient({
  baseUrl: "http://opencode-server:3100",
});
```

### Create Session

```typescript
const sessionResponse = await client.session.create({
  body: {
    title: "My Task",
    metadata: {
      taskId: "task-123",
      agentId: "agent-456",
    },
  },
});

console.log("Session ID:", sessionResponse.id);
```

### Send Prompt

```typescript
await client.session.prompt({
  path: { id: sessionResponse.id },
  body: {
    parts: [{ type: "text", text: "Create a Python hello world script" }],
  },
});
```

### Subscribe to Events

```typescript
const events = await client.event.subscribe();

for await (const event of events.stream) {
  console.log("Event:", event.type, event.properties);
  
  if (event.type === "session.idle") {
    console.log("Session completed!");
  }
}
```

### Read Files

```typescript
const fileData = await client.file.read({
  query: { path: "/workspace/hello.py" },
});

console.log("File content:", fileData.content);
```

### List Files

```typescript
const files = await client.file.status({
  query: { path: "/workspace" },
});

console.log("Files:", files.map(f => f.path));
```

## OpenCode Plugins

### Plugin System

OpenCode supports custom plugins that hook into various events and extend functionality.

**Plugin Location**: `.opencode/plugin/`

### Matrix Notifications Plugin

**File**: `.opencode/plugin/matrix-notifications.js`

```javascript
export const MatrixNotifications = async ({ project, client, $, directory, worktree }) => {
  const MATRIX_API_URL = process.env.MATRIX_API_URL;
  
  async function sendNotification(title, message, taskId, status) {
    await fetch(`${MATRIX_API_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, taskId, status }),
    });
  }
  
  return {
    event: async ({ event }) => {
      if (event.type === 'session.idle') {
        await sendNotification(
          'OpenCode Session Completed',
          `Session completed in ${directory}`,
          event.sessionId,
          'completed'
        );
      }
      
      if (event.type === 'file.edited') {
        await sendNotification(
          'File Edited',
          `File ${event.file} was edited`,
          event.sessionId,
          'file_edit'
        );
      }
    },
  };
};
```

### Plugin Hooks

OpenCode plugins can hook into these events:

- `event` - All events (session.idle, session.error, message.created, file.edited)
- `tool.execute.before` - Before tool execution
- `tool.execute.after` - After tool execution

### Custom Tools

Plugins can also add custom tools:

```javascript
import { tool } from "@opencode-ai/plugin";

export const CustomToolsPlugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "This is a custom tool",
        args: {
          foo: tool.schema.string(),
        },
        async execute(args, ctx) {
          return `Hello ${args.foo}!`;
        },
      }),
    },
  };
};
```

## Advantages of Server Mode

### vs Docker Mode

| Feature | Server Mode | Docker Mode |
|---------|-------------|-------------|
| **Session Persistence** | ✅ Sessions persist across requests | ❌ New container per task |
| **Real-time Events** | ✅ Server-sent events stream | ❌ Parse stdout |
| **Resource Efficiency** | ✅ Single persistent process | ❌ Container spin-up overhead |
| **File Access** | ✅ Direct API access during execution | ❌ Only after completion |
| **API Type Safety** | ✅ TypeScript SDK | ❌ CLI output parsing |
| **Plugin Support** | ✅ Custom plugins | ❌ Not available |
| **Concurrent Tasks** | ✅ Multiple sessions in one server | ⚠️ Multiple containers |

### Performance

- **Startup**: ~1s (server already running) vs ~3-5s (container spawn)
- **Memory**: Single server process vs per-task containers
- **Network**: Internal HTTP vs Docker networking

## Testing

### Health Check

```bash
curl http://192.168.50.90:3100/config
```

Expected:
```json
{
  "agent": {},
  "mode": {},
  "plugin": [],
  "command": {},
  "username": "root"
}
```

### Create Session

```bash
curl -X POST http://192.168.50.90:3100/session \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Session"}'
```

### List Sessions

```bash
curl http://192.168.50.90:3100/session | jq
```

### View OpenAPI Docs

```bash
curl http://192.168.50.90:3100/doc
```

Or visit: http://192.168.50.90:3100/doc in a browser

## Deployment Status

**Current State**: ✅ Production Ready

```
✅ OpenCode server running on port 3100
✅ OpenCode SDK integrated in MCP server
✅ Health checks using /config endpoint
✅ Matrix notification plugin installed
✅ Server mode enabled (OPENCODE_SERVER_ENABLED=true)
✅ All services healthy
```

### Service URLs

- **MCP Server**: http://192.168.50.90:3500
- **OpenCode Server**: http://192.168.50.90:3100
- **OpenCode Docs**: http://192.168.50.90:3100/doc

## Troubleshooting

### Server Not Starting

Check logs:
```bash
docker logs opencode-server
```

Common issues:
- Missing `--print-logs` flag
- Wrong port flag (`-p` not `--port`)
- Permission issues with `/root/.config/opencode`

### Plugin Not Loading

Verify mount:
```bash
docker exec opencode-server ls -la /root/.config/opencode/plugin/
```

Should show `matrix-notifications.js`

### SDK Connection Issues

Test connectivity:
```bash
curl http://opencode-server:3100/config
```

Check environment:
```bash
docker exec letta-opencode-plugin env | grep OPENCODE
```

## Migration from Docker Mode

1. **Set environment variable**:
   ```bash
   OPENCODE_SERVER_ENABLED=true
   ```

2. **Restart services**:
   ```bash
   docker compose restart
   ```

3. **Verify**:
   ```bash
   curl http://192.168.50.90:3500/health
   curl http://192.168.50.90:3100/config
   ```

## References

- [OpenCode Server Documentation](https://opencode.opetech.com/docs/server)
- [OpenCode SDK GitHub](https://github.com/opencode-ai/sdk)
- [OpenCode Plugin System](https://opencode.opetech.com/docs/plugins)
- [MCP Protocol Spec](https://spec.modelcontextprotocol.io)

---

**Status**: Server mode is fully operational and recommended for production use.
