# Letta OpenCode Plugin - Architecture

## Overview

The Letta OpenCode Plugin implements the **"OpenCode as Appendage"** architectural pattern, where OpenCode acts as an ephemeral execution layer for Letta agents. This design allows Letta agents to maintain high-level context and orchestration while delegating concrete development tasks to OpenCode.

## Core Principles

1. **Separation of Concerns**: Letta handles planning and memory; OpenCode handles execution
2. **Bidirectional Communication**: Real-time updates via workspace memory blocks
3. **Idempotency**: Prevent duplicate task execution with 24-hour deduplication window
4. **Resource Management**: CPU/memory limits and timeouts for container execution
5. **Reliability**: Retry logic for API calls, graceful degradation on errors

## Components

### 1. MCP Server (`server.ts`)

The main entry point exposing tools via Model Context Protocol (JSON-RPC over HTTP).

**Transport:** Streamable HTTP with session management (MCP protocol 2025-06-18)

**Responsibilities:**
- Tool registration and request routing
- Dependency injection for managers
- Error handling and response formatting
- HTTP server initialization via `http-transport.ts`

**Tools Exposed:**
- `ping` - Connectivity test
- `health` - Server status and metrics
- `opencode_execute_task` - Task delegation to OpenCode

### HTTP Transport (`http-transport.ts`)

Express-based HTTP server implementing StreamableHTTPServerTransport.

**Features:**
- Session-based transport with UUIDs
- In-memory event store for recovery
- Origin validation (DNS rebinding protection)
- CORS support for allowed origins
- Protocol version validation (2025-06-18, 2025-03-26)
- Session cleanup on disconnect
- Graceful shutdown handling

**Endpoints:**
- `POST /mcp` - MCP JSON-RPC requests
- `GET /mcp` - SSE streaming for active sessions
- `DELETE /mcp` - Session termination
- `GET /health` - Health check

### 2. Letta Client Adapter (`letta-client.ts`)

Typed HTTP client for Letta API with resilience features.

**Features:**
- Automatic retry for 5xx errors (exponential backoff)
- Optimistic concurrency handling for 409 conflicts
- Request timeout management
- Bearer token authentication

**Key Methods:**
- `getAgent(agentId)` - Retrieve agent details
- `createMemoryBlock(agentId, request)` - Create workspace block
- `updateMemoryBlock(agentId, blockId, request)` - Update workspace with retry on 409
- `listMemoryBlocks(agentId)` - List agent's memory blocks

### 3. Workspace Manager (`workspace-manager.ts`)

Manages structured workspace memory blocks for task communication.

**Schema Version:** `1.0.0`

**Workspace Block Structure:**
```typescript
{
  version: string;           // Schema version
  task_id: string;          // Unique task identifier
  agent_id: string;         // Requesting agent ID
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  created_at: number;       // Unix timestamp
  updated_at: number;       // Unix timestamp
  events: WorkspaceEvent[]; // Chronological event log
  artifacts: WorkspaceArtifact[]; // Task outputs
  metadata?: Record<string, unknown>; // Custom data
}
```

**Events:**
- `task_started` - Execution began
- `task_progress` - Intermediate updates
- `task_completed` - Successful completion
- `task_failed` - Error occurred
- `task_timeout` - Execution timeout

**Artifacts:**
- `file` - Generated file content
- `output` - Standard output
- `error` - Error messages
- `log` - Execution logs

### 4. Execution Manager (`execution-manager.ts`)

Docker container orchestration for OpenCode task execution.

**Container Lifecycle:**
1. **Spawn**: Create container with labels and resource limits
2. **Monitor**: Stream stdout/stderr, track execution time
3. **Timeout**: Send SIGTERM, then SIGKILL after grace period
4. **Cleanup**: Container automatically removed (`--rm` flag)

**Resource Limits:**
- CPU: Configurable via `RUNNER_CPU_LIMIT` (default: `2.0`)
- Memory: Configurable via `RUNNER_MEMORY_LIMIT` (default: `2g`)
- Timeout: Configurable via `RUNNER_TIMEOUT_MS` (default: `300000` / 5 minutes)

**Container Labels:**
- `task_id` - For tracking and cleanup
- `agent_id` - For auditing and multi-tenancy

### 5. Task Registry (`task-registry.ts`)

In-memory task queue with idempotency tracking.

**Features:**
- Task deduplication using idempotency keys (24-hour window)
- Concurrent task limiting (default: 3 parallel executions)
- Automatic cleanup of completed tasks after expiry
- Task status tracking (queued → running → completed/failed/timeout)

**Key Methods:**
- `register(taskId, agentId, idempotencyKey?)` - Register new task or return existing
- `updateStatus(taskId, status, workspaceBlockId?)` - Update task state
- `canAcceptTask()` - Check if queue has capacity
- `getRunningTasksCount()` - Active task count for metrics

### 6. Execute Task Tool (`tools/execute-task.ts`)

Core tool implementation for task delegation.

**Flow:**

```
┌─────────────┐
│   Agent     │
│  Request    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Idempotency     │  ◄─── Check if task already exists
│ Check           │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Queue           │  ◄─── Return 429 if queue full
│ Capacity        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Create          │  ◄─── Create workspace memory block
│ Workspace       │
└──────┬──────────┘
       │
       ├─── sync=false ──► Return immediately (async)
       │
       └─── sync=true ───► Wait for completion (sync)
                           │
                           ▼
                    ┌─────────────────┐
                    │ Docker          │
                    │ Execution       │
                    └──────┬──────────┘
                           │
                           ▼
                    ┌─────────────────┐
                    │ Update          │
                    │ Workspace       │
                    └──────┬──────────┘
                           │
                           ▼
                    ┌─────────────────┐
                    │ Return Result   │
                    └─────────────────┘
```

**Parameters:**
- `agent_id` (required) - Requesting agent
- `task_description` (required) - Natural language task
- `idempotency_key` (optional) - Deduplication key
- `timeout_ms` (optional) - Override default timeout
- `sync` (optional, default: `false`) - Wait for completion

**Return (Async):**
```json
{
  "task_id": "task-1234567890-abc123",
  "status": "queued",
  "workspace_block_id": "block-xyz789",
  "message": "Task queued for execution"
}
```

**Return (Sync - Success):**
```json
{
  "task_id": "task-1234567890-abc123",
  "status": "completed",
  "workspace_block_id": "block-xyz789",
  "exit_code": 0,
  "duration_ms": 15234,
  "output": "Task completed successfully..."
}
```

**Return (Sync - Error):**
```json
{
  "task_id": "task-1234567890-abc123",
  "status": "failed",
  "workspace_block_id": "block-xyz789",
  "exit_code": 1,
  "duration_ms": 3421,
  "output": "Error: ..."
}
```

## Data Flow

### Task Submission (Async)

```
Agent → MCP Server → Task Registry → Workspace Manager → Letta API
                         │                    │
                         └────► Return task_id
                         
Background:
Task Registry → Execution Manager → Docker → OpenCode
                     │
                     └──► Update Workspace → Letta API
```

### Task Submission (Sync)

```
Agent → MCP Server → Task Registry → Workspace Manager → Letta API
                         │
                         └──► Execution Manager → Docker → OpenCode
                                   │
                                   └──► Update Workspace → Letta API
                                             │
                                             └──► Return result
```

### Workspace Updates (Bidirectional)

```
Letta Agent ──► Read workspace block ──► Get task status/events
                                          
OpenCode ────► Write to workspace ────► Events, artifacts, status
               (via Execution Manager)
```

## Error Handling

### API Errors

| Error Code | Behavior | Retry |
|------------|----------|-------|
| 409 Conflict | Optimistic concurrency failure | Yes (3x with backoff) |
| 5xx Server Error | Letta API unavailable | Yes (3x with backoff) |
| 4xx Client Error | Invalid request | No |
| Timeout | Request exceeded limit | Optional (1x) |

### Execution Errors

| Error Type | Behavior |
|------------|----------|
| Container spawn failure | Return error to agent, status=failed |
| Task timeout | SIGTERM → wait 5s → SIGKILL, status=timeout |
| Non-zero exit code | Capture output/error, status=failed |
| Docker daemon unreachable | Return error, status=failed |

## Security Considerations

1. **Container Isolation**: Each task runs in isolated Docker container
2. **Resource Limits**: CPU and memory caps prevent resource exhaustion
3. **Timeout Enforcement**: Hard limits prevent runaway tasks
4. **No Network Access**: Containers can optionally disable internet (future feature flag)
5. **Token Security**: Letta API token stored in environment, never logged
6. **Input Validation**: All tool parameters validated with Zod schemas

## Scalability

### Current Limitations (MVP)

- In-memory task registry (lost on restart)
- Single-process architecture
- Local Docker daemon only

### Future Enhancements

- Persistent task storage (Redis/PostgreSQL)
- Multi-process/cluster mode
- Remote Docker execution (Kubernetes pods)
- Prometheus metrics endpoint
- Structured logging (JSON format)
- Rate limiting per agent
- Task priority queue

## Configuration Matrix

| Variable | Type | Default | Impact |
|----------|------|---------|--------|
| `MAX_CONCURRENT_TASKS` | number | 3 | Queue capacity, throughput |
| `RUNNER_TIMEOUT_MS` | number | 300000 | Max task duration |
| `RUNNER_CPU_LIMIT` | string | "2.0" | CPU cores per task |
| `RUNNER_MEMORY_LIMIT` | string | "2g" | RAM per task |
| `LETTA_API_URL` | string | required | Letta backend endpoint |
| `LETTA_API_TOKEN` | string | required | Authentication |
| `DEBUG` | boolean | false | Verbose logging |

## Testing Strategy

### Unit Tests (TODO)

- Letta Client retry logic
- Workspace Manager schema operations
- Task Registry idempotency
- Execution Manager container lifecycle

### Integration Tests (TODO)

- End-to-end task execution with mock Docker
- Workspace block updates with mock Letta API
- Error scenarios (timeouts, 409s, 5xx)

### E2E Tests (TODO)

- Full workflow with real Letta instance
- Multi-task concurrency
- Idempotency key collision
- Resource limit enforcement

## Monitoring & Observability

### Metrics (via `health` tool)

```json
{
  "active_tasks": 2,
  "can_accept_task": true
}
```

### Future Metrics (Prometheus)

- `letta_opencode_tasks_active` (gauge)
- `letta_opencode_tasks_queued` (gauge)
- `letta_opencode_task_duration_seconds` (histogram)
- `letta_opencode_task_failures_total` (counter)
- `letta_opencode_api_requests_total` (counter)

### Logging

- Task lifecycle events (queued, started, completed, failed)
- API errors with correlation IDs
- Container spawn/kill events
- Idempotency key hits

## Version History

- **v0.1.0** (Current) - MVP with core functionality
  - MCP server with stdio transport
  - Async/sync task execution
  - Workspace memory blocks
  - Docker container orchestration
  - Task registry with idempotency
  - Retry logic for Letta API
