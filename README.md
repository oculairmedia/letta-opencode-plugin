# Letta OpenCode Plugin

MCP server that enables Letta agents to delegate tasks to OpenCode for execution.

## Architecture Overview

This plugin implements the "OpenCode as Appendage" pattern where OpenCode acts as an ephemeral execution layer for Letta agents:

- **Letta agents** maintain context, planning, and orchestration
- **OpenCode** handles concrete execution of development tasks
- **Communication** happens bidirectionally via Letta memory blocks
- **Transport** uses HTTP-based MCP (JSON-RPC)

### Key Components

1. **MCP Server** - Streamable HTTP JSON-RPC server exposing OpenCode capabilities (MCP protocol 2025-06-18)
2. **Letta Client Adapter** - Typed wrapper for Letta API with retry logic
3. **Execution Manager** - Docker container orchestration with resource limits
4. **Workspace Memory Blocks** - Shared state between Letta and OpenCode
5. **HTTP Transport** - Session-based HTTP streaming with origin validation and DNS rebinding protection
6. **Agent ID Header Support** - Automatic extraction of agent ID from `x-agent-id` HTTP header

## Installation

```bash
npm install
npm run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

### Required Variables

- `LETTA_API_URL` - Letta API endpoint (e.g., `https://letta.oculair.ca`)
- `LETTA_API_TOKEN` - Authentication token for Letta API

### Runner Configuration

- `RUNNER_IMAGE` - Docker image for OpenCode execution (default: `ghcr.io/anthropics/claude-code:latest`)
- `RUNNER_CPU_LIMIT` - CPU limit per container (default: `2.0`)
- `RUNNER_MEMORY_LIMIT` - Memory limit per container (default: `2g`)
- `RUNNER_TIMEOUT_MS` - Task execution timeout in milliseconds (default: `300000`)

### Task Queue

- `MAX_CONCURRENT_TASKS` - Maximum concurrent task executions (default: `3`)

### Server Configuration

- `MCP_PORT` - Server port (default: `3456`)
- `MCP_HOST` - Server host (default: `0.0.0.0`)
- `DEBUG` - Enable debug logging (default: `false`)

### Feature Flags

- `ENABLE_ASYNC_EXECUTE` - Allow async task execution (default: `true`)
- `ENFORCE_IDEMPOTENCY` - Enforce idempotency keys (default: `true`)

## Usage

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

## Tools Provided

### `ping`
Simple connectivity test.

### `health`
Returns server status and environment configuration.

### `opencode_execute_task`

Delegates a development task to OpenCode for execution in an isolated Docker container.

**Parameters:**
- `agent_id` (string, required): ID of the Letta agent requesting the task
- `task_description` (string, required): Natural language description of the task to execute
- `idempotency_key` (string, optional): Key to prevent duplicate execution within 24-hour window
- `timeout_ms` (number, optional): Task execution timeout in milliseconds (overrides default)
- `sync` (boolean, optional): If `true`, wait for completion; if `false`, return immediately (default: `false`)

**Returns:**
- `task_id`: Unique identifier for the task
- `status`: Current task status (`queued`, `running`, `completed`, `failed`, `timeout`)
- `workspace_block_id`: ID of the workspace memory block for bidirectional communication
- Additional fields when `sync=true`: `exit_code`, `duration_ms`, `output`

**Example (Async):**
```json
{
  "agent_id": "agent-123",
  "task_description": "Create a new React component for user profile",
  "idempotency_key": "profile-component-v1",
  "sync": false
}
```

**Example (Sync):**
```json
{
  "agent_id": "agent-123",
  "task_description": "Run unit tests and return results",
  "sync": true,
  "timeout_ms": 60000
}
```

## Development Status

- [x] LETTA-9: Bootstrap HTTP MCP server skeleton
- [x] LETTA-10: Implement Letta client adapter with retries & 409 handling
- [x] LETTA-11: Create execution manager for Docker container orchestration
- [x] LETTA-12: Implement task execution tools with idempotency & queuing
- [x] LETTA-13: Define workspace block schema with versioning
- [x] LETTA-14: Add metrics, logs, and documentation

## Project Structure

```
letta-opencode-plugin/
├── src/
│   ├── server.ts              # Main MCP server with tool handlers
│   ├── letta-client.ts        # Letta API wrapper with retry logic
│   ├── workspace-manager.ts   # Workspace memory block management
│   ├── execution-manager.ts   # Docker container orchestration
│   ├── task-registry.ts       # Task queue and idempotency tracking
│   ├── tools/
│   │   └── execute-task.ts    # opencode_execute_task implementation
│   └── types/
│       ├── letta.ts           # Letta API types
│       ├── workspace.ts       # Workspace block schema
│       ├── execution.ts       # Execution manager types
│       └── task.ts            # Task registry types
├── dist/                      # Compiled output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## OpenCode Integration

This plugin integrates with OpenCode server to provide AI-assisted development task execution. See [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md) for:

- OpenCode server configuration and authentication
- Claude Sonnet 4.5 model setup
- Agent-to-agent communication patterns
- Host credential mounting strategy
- Troubleshooting guide

**Key Features:**
- Uses host system's OpenCode credentials (no duplicate API keys)
- Configured to use Claude Sonnet 4.5 via Anthropic
- OpenCode agents communicate back to calling Letta agents via MCP tools
- Full access to host's configured MCP servers

## Architecture Deep Dive

### Workspace Memory Blocks

Workspace blocks are Letta memory blocks with a structured JSON schema that enable bidirectional communication between Letta agents and OpenCode:

```typescript
{
  version: "1.0.0",
  task_id: "task-abc123",
  agent_id: "agent-456",
  status: "running",
  created_at: 1234567890000,
  updated_at: 1234567890123,
  events: [
    {
      timestamp: 1234567890100,
      type: "task_started",
      message: "Task execution started",
      data: { /* optional metadata */ }
    }
  ],
  artifacts: [
    {
      timestamp: 1234567890120,
      type: "output",
      name: "execution_output",
      content: "Task completed successfully"
    }
  ],
  metadata: { /* custom task metadata */ }
}
```

### Task Lifecycle

1. **Queue**: Agent calls `opencode_execute_task` → Task registered with idempotency check
2. **Create Workspace**: Workspace memory block created and attached to agent
3. **Execute**: Docker container spawned with resource limits and timeout
4. **Monitor**: Container logs captured, events written to workspace block
5. **Complete**: Final status and artifacts written to workspace block
6. **Cleanup**: Task removed from registry after 24-hour idempotency window

### Error Handling

- **409 Conflicts**: Automatic retry with exponential backoff for optimistic concurrency
- **5xx Errors**: Retry up to 3 times with backoff
- **Timeouts**: SIGTERM followed by SIGKILL after grace period
- **Queue Full**: Return 429 error when max concurrent tasks exceeded

## Deployment

### Using with HTTP Transport

The server runs as a standalone HTTP service. Configure it with environment variables:

```bash
export LETTA_API_URL=https://letta.oculair.ca
export LETTA_API_TOKEN=your-token-here
export MCP_PORT=3500
npm start
```

Then connect clients to `http://localhost:3500/mcp`

Health check: `curl http://localhost:3500/health`

### Docker Deployment (Dockge Compatible)

#### Quick Start

```bash
# Clone/navigate to the project
cd /opt/stacks/letta-opencode-plugin

# Configure environment
cp .env.example .env
# Edit .env with your Letta API credentials

# Start with Docker Compose
docker compose up -d

# Check health
curl http://localhost:3500/health

# View logs
docker compose logs -f
```

#### Dockge Integration

This stack is fully compatible with Dockge. Simply:

1. Add the stack directory to Dockge's stacks path
2. Configure `.env` variables in Dockge UI
3. Deploy from Dockge interface

#### Important: Docker Socket Access

The container requires access to the Docker socket to spawn OpenCode execution containers:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

Ensure the `letta` user in the container has proper Docker group permissions.

### Health Monitoring

The `health` tool returns metrics useful for monitoring:

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "environment": {
    "letta_api_url": "https://letta.oculair.ca",
    "runner_image": "ghcr.io/anthropics/claude-code:latest"
  },
  "metrics": {
    "active_tasks": 2,
    "can_accept_task": true
  }
}
```

## License

MIT

## Agent ID Header Support

The server automatically extracts the agent ID from the `x-agent-id` HTTP header when present. This allows Letta agents to call the MCP server without explicitly passing `agent_id` in tool parameters.

### How It Works

1. **Header Extraction**: The HTTP transport layer reads the `x-agent-id` header from incoming requests
2. **Parameter Injection**: If `agent_id` is not provided in tool arguments, it's automatically injected from the header
3. **Logging**: When DEBUG=true, agent ID extraction and injection is logged for troubleshooting

### Example Usage

```bash
# Initialize session
curl -X POST http://localhost:3500/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-protocol-version: 2025-06-18" \
  -H "x-agent-id: agent-597b5756-2915-4560-ba6b-91005f085166" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"letta-agent","version":"1.0"}}}'

# Call tool with header (agent_id automatically injected)
curl -X POST http://localhost:3500/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <session-id>" \
  -H "x-agent-id: agent-597b5756-2915-4560-ba6b-91005f085166" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"opencode_execute_task","arguments":{"task_description":"Create a new React component"}}}'
```

### Debug Mode

Enable debug logging to see agent ID header processing:

```bash
# In .env
DEBUG=true

# In logs you'll see:
# [http-transport] POST /mcp - 172.17.86.1 (agent: agent-597b5756-2915-4560-ba6b-91005f085166)
# [http-transport] Injected agent_id from x-agent-id header: agent-597b5756-2915-4560-ba6b-91005f085166
```

### Priority Rules

- **Explicit parameter** takes precedence: If `agent_id` is provided in tool arguments, the header is ignored
- **Header fallback**: If `agent_id` is missing from arguments, the `x-agent-id` header value is used
- **Validation**: The agent ID from either source must be valid (matching pattern: `^[a-zA-Z0-9\-_]+$`)

