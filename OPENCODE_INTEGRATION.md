# OpenCode Integration Guide

This document describes the integration between the Letta OpenCode Plugin and the OpenCode server, including authentication, model configuration, and agent-to-agent communication patterns.

## Overview

The plugin uses the official OpenCode JS/TS SDK (`@opencode-ai/sdk`) to communicate with a headless OpenCode server running in a Docker container. The OpenCode server is configured to use the host system's credentials and configuration, enabling seamless AI provider access and MCP tool availability.

## Architecture

```
Letta Agent → MCP Tool Call → Plugin → OpenCode Server → Claude Sonnet 4.5
                    ↑                                              ↓
                    └──────── OpenCode Agent Response ────────────┘
```

### Key Components

1. **OpenCode Client Manager** (`src/opencode-client-manager.ts`)
   - Creates and manages OpenCode sessions using the official SDK
   - Sends prompts with enhanced instructions for agent communication
   - Monitors session events and status

2. **OpenCode Server** (Docker container)
   - Headless HTTP server exposing OpenAPI endpoints
   - Configured with host system credentials
   - Runs on port 3100 (internal)

3. **Host Configuration Mounting**
   - Authentication credentials from `/root/.local/share/opencode/auth.json`
   - Server configuration from `/root/.config/opencode/opencode.json`
   - Cache data from `/root/.cache/opencode/`

## Configuration

### Docker Compose Setup

The `opencode-server` service in `compose.yaml` mounts the host's OpenCode directories:

```yaml
opencode-server:
  build:
    context: .
    dockerfile: Dockerfile.opencode
  ports:
    - "3100:3100"
  volumes:
    - opencode-workspaces:/workspace
    - /root/.config/opencode:/root/.config/opencode:ro        # Config (read-only)
    - /root/.local/share/opencode:/root/.local/share/opencode # Auth & storage (read-write)
    - /root/.cache/opencode:/root/.cache/opencode:ro         # Cache (read-only)
```

**Important Volume Access Modes:**
- **Config** (`/root/.config/opencode`): Read-only - contains immutable configuration
- **Auth/Storage** (`/root/.local/share/opencode`): Read-write - OpenCode needs to update storage state
- **Cache** (`/root/.cache/opencode`): Read-only - can be regenerated if needed

### Model Configuration

The plugin is configured to use Claude Sonnet 4.5 (Anthropic) via the OpenCode server:

**File:** `src/opencode-client-manager.ts`

```typescript
await this.client.session.prompt({
  path: { id: sessionResponse.id },
  body: {
    model: {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-5-20250929"
    },
    parts: [{ type: "text", text: enhancedPrompt }],
  },
});
```

This configuration leverages the Anthropic credentials stored in the host's `auth.json` file, eliminating the need to manage separate API keys in the plugin.

## Agent-to-Agent Communication

### The Pattern

Instead of the plugin directly responding to the calling Letta agent, the OpenCode agent itself is instructed to communicate back using available MCP tools. This creates a proper agent-to-agent communication pattern.

### How It Works

1. **Enhanced Prompt Injection**

When creating an OpenCode session, the plugin enhances the user's task description with communication instructions:

```typescript
const enhancedPrompt = `${prompt}

IMPORTANT: When you complete this task, you MUST send a message back to the
calling Letta agent (ID: ${agentId}) with a summary of what you accomplished.
Use the available Letta MCP tools to send a message with:
- A brief summary of what you did
- The status (success or failure)
- Any important outputs or files created
- Any issues encountered

Task ID: ${taskId}
Calling Agent ID: ${agentId}`;
```

2. **OpenCode Agent Execution**

The OpenCode agent:
- Executes the requested task
- Has access to Letta MCP tools (via host's OpenCode config)
- Sends a completion message to the calling agent
- Includes contextual information about what was accomplished

3. **Letta Agent Response**

The calling Letta agent:
- Receives the completion message from OpenCode
- Processes the task results
- Can continue the conversation or take further action

### Available Tools

Because the OpenCode server uses the host's configuration, it has access to any MCP servers configured on the host system, including:

- **Letta MCP Tools** - For sending messages to Letta agents
- **Filesystem Tools** - For file operations
- **Git Tools** - For version control operations
- **Any other configured MCP servers**

### Example Flow

```
1. Letta Agent calls opencode_execute_task
   ↓
2. Plugin creates OpenCode session with enhanced prompt
   ↓
3. OpenCode Agent receives task + instructions to report back
   ↓
4. OpenCode Agent completes task
   ↓
5. OpenCode Agent uses Letta MCP tool to send completion message
   ↓
6. Letta Agent receives message with results
   ↓
7. Workspace block is detached (task cleanup)
```

## Authentication Flow

### Host Credentials

The host system's OpenCode authentication is stored in:

```
/root/.local/share/opencode/auth.json
```

This file contains credentials for multiple providers:

```json
{
  "anthropic": { /* API key and config */ },
  "cerebras": { /* API key and config */ },
  "github-copilot": { /* Token and config */ },
  "openai": { /* API key and config */ }
}
```

### Container Access

The Docker container mounts this directory (read-write) so OpenCode can:
- Read existing credentials
- Update authentication state if needed
- Access all configured providers

### Provider Selection

When creating a session, the plugin explicitly selects the Anthropic provider:

```typescript
model: {
  providerID: "anthropic",      // Use Anthropic provider
  modelID: "claude-sonnet-4-5-20250929"  // Specific model version
}
```

This ensures consistent model usage while leveraging the host's credentials.

## Troubleshooting

### OpenCode Server Not Responding

Check if the server is running and accessible:

```bash
curl -s http://localhost:3100/config
```

Expected response: Server configuration with available providers.

### Authentication Issues

Verify that Anthropic credentials are available:

```bash
curl -s http://localhost:3100/config/providers | jq '.providers[] | select(.id=="anthropic")'
```

Check container has access to auth file:

```bash
docker exec opencode-server cat /root/.local/share/opencode/auth.json
```

### Read-Only File System Errors

If you see errors like:

```
EROFS: read-only file system, open '/root/.local/share/opencode/storage/...'
```

The `/root/.local/share/opencode` mount needs to be read-write (not `:ro`):

```yaml
- /root/.local/share/opencode:/root/.local/share/opencode  # NOT :ro
```

### Agent Not Responding Back

Verify OpenCode agent has access to Letta MCP tools:

1. Check MCP servers configured on host: `opencode mcp list`
2. Verify Letta MCP server is running
3. Check OpenCode server logs: `docker compose logs opencode-server`

## Environment Variables

### Plugin Variables

```bash
OPENCODE_SERVER_ENABLED=true                        # Enable OpenCode integration
OPENCODE_SERVER_URL=http://opencode-server:3100    # Internal Docker network URL
```

### OpenCode Server Variables

```bash
MATRIX_API_URL=http://letta-opencode-plugin:3500/matrix  # Optional Matrix integration
```

## Benefits of This Approach

1. **No Duplicate Credentials** - Uses existing host authentication
2. **Model Consistency** - Same Claude Sonnet 4.5 across all OpenCode usage
3. **MCP Tool Access** - OpenCode agents can use all host-configured tools
4. **Agent Autonomy** - OpenCode agent decides what to communicate back
5. **Proper Separation** - Plugin orchestrates, agents execute and communicate

## Version Information

- **OpenCode SDK**: `@opencode-ai/sdk` v0.15.0
- **Host OpenCode**: v0.15.8
- **Model**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- **Provider**: Anthropic

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Overall plugin architecture
- [README.md](./README.md) - Setup and usage guide
- [WORKSPACE_CONFIG.md](./WORKSPACE_CONFIG.md) - Workspace block schema
