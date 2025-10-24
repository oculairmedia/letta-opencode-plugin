# OpenCode CLI Usage

## Overview

The Letta OpenCode Plugin uses **OpenCode CLI** (not Claude Code) for task execution. This document explains the OpenCode CLI integration.

## OpenCode vs Claude Code

| Feature | OpenCode | Claude Code |
|---------|----------|-------------|
| **CLI Command** | `opencode` | `claude` |
| **npm Package** | `opencode-ai` | N/A (binary) |
| **Version** | 0.15.0 | N/A |
| **Source** | Open source | Anthropic proprietary |
| **Install** | `npm install -g opencode-ai` | Binary download |

## OpenCode CLI Commands

### Available Commands

```bash
opencode [project]           # Start OpenCode TUI
opencode run [message..]     # Run with a message (non-interactive)
opencode serve               # Start headless server
opencode attach <server>     # Attach to running server
opencode auth                # Manage credentials
opencode agent               # Manage agents
opencode models              # List available models
opencode export [sessionID]  # Export session data
opencode github              # Manage GitHub agent
```

### What We Use

**Docker Mode:** `opencode run "{prompt}"`

**Example:**
```bash
docker run --rm \
  -v /workspace:/workspace \
  -w /workspace \
  letta-opencode-runner:latest \
  opencode run "Create a Python script that prints hello world"
```

## Docker Runner Image

### Dockerfile: `Dockerfile.runner`

```dockerfile
FROM node:20-slim

WORKDIR /workspace

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git curl ca-certificates \
    python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode CLI
RUN npm install -g opencode-ai@0.15.0

# Setup user
RUN groupadd -r opencode && useradd -r -g opencode opencode
RUN chown -R opencode:opencode /workspace
USER opencode

CMD ["opencode", "run", "echo 'OpenCode runner ready'"]
```

### Build Command

```bash
docker build -f Dockerfile.runner -t letta-opencode-runner:latest .
```

### Image Details

**Base:** `node:20-slim`  
**Size:** ~600MB  
**Includes:**
- Node.js 20
- OpenCode CLI 0.15.0
- Git, curl, Python3
- Build tools

## Execution Flow

### 1. Task Request
```typescript
const request: ExecutionRequest = {
  taskId: "task-123",
  agentId: "agent-456",
  prompt: "Create a REST API with Express",
  workspaceBlockId: "block-789"
};
```

### 2. Docker Container Spawn
```bash
docker run --rm \
  --name opencode-task-123-{timestamp} \
  -v /tmp/opencode-workspaces/task-123:/workspace \
  -w /workspace \
  --cpus 2.0 \
  --memory 2g \
  letta-opencode-runner:latest \
  opencode run "Create a REST API with Express"
```

### 3. OpenCode Execution
- OpenCode CLI starts in `/workspace`
- Processes the prompt
- Creates files, runs commands
- Outputs to stdout/stderr

### 4. Output Capture
- stdout → task output
- stderr → error output
- Exit code → task status
- Files → persist in workspace

## Configuration

### Environment Variables

```bash
# Runner image
RUNNER_IMAGE=letta-opencode-runner:latest

# Resource limits
RUNNER_CPU_LIMIT=2.0
RUNNER_MEMORY_LIMIT=2g
RUNNER_TIMEOUT_MS=300000

# Workspace directory
WORKSPACE_DIR=/tmp/opencode-workspaces
```

## OpenCode Authentication

### API Keys

OpenCode requires authentication for AI model access.

**Set via environment:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Or in Docker:**
```bash
docker run --rm \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  letta-opencode-runner:latest \
  opencode run "..."
```

**Or via opencode auth:**
```bash
opencode auth
# Follow prompts to configure credentials
```

## Differences from Claude Code

### Command Structure

**Claude Code:**
```bash
claude --dangerously-skip-permissions "prompt"
```

**OpenCode:**
```bash
opencode run "prompt"
```

### Features

**OpenCode Advantages:**
- ✅ Open source
- ✅ npm installable
- ✅ Headless server mode (`opencode serve`)
- ✅ Agent management
- ✅ Model selection
- ✅ Session export

**Claude Code Advantages:**
- ✅ Official Anthropic tool
- ✅ Optimized for Claude models
- ✅ Better permissions handling

## OpenCode Serve Mode

### Starting Server

```bash
opencode serve --port 3100 --host 0.0.0.0
```

### Usage in Plugin

When `OPENCODE_SERVER_ENABLED=true`:

```typescript
// Creates HTTP session instead of spawning container
const session = await openCodeClient.createSession(
  taskId,
  agentId,
  prompt
);

// Subscribe to events
openCodeClient.subscribeToEvents(session.sessionId, (event) => {
  console.log(event);
});
```

## Troubleshooting

### "opencode: command not found"

**Solution:** Install OpenCode CLI
```bash
npm install -g opencode-ai@0.15.0
```

### "ANTHROPIC_API_KEY not set"

**Solution:** Set API key
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or configure via:
```bash
opencode auth
```

### Container fails to start

**Check image:**
```bash
docker images | grep letta-opencode-runner
```

**Rebuild if needed:**
```bash
docker build -f Dockerfile.runner -t letta-opencode-runner:latest .
```

### Workspace files not persisting

**Verify mount:**
```bash
docker inspect {container-id} | jq '.[0].Mounts'
```

Should show `/workspace` mounted to host directory.

## Testing

### Test OpenCode Locally

```bash
# Create test workspace
mkdir -p /tmp/test-opencode
cd /tmp/test-opencode

# Run OpenCode
opencode run "Create a Python hello world script"

# Check output
ls -la
cat hello.py
```

### Test Docker Runner

```bash
# Run test task
docker run --rm \
  -v /tmp/test-opencode:/workspace \
  -w /workspace \
  letta-opencode-runner:latest \
  opencode run "List files and show current directory"
```

## Migration Notes

### From Claude Code

If you were using `claude` CLI before:

1. **Replace image:**
   ```bash
   # Old
   RUNNER_IMAGE=ghcr.io/anthropics/claude-code:latest
   
   # New
   RUNNER_IMAGE=letta-opencode-runner:latest
   ```

2. **Update command:**
   ```bash
   # Old
   claude --dangerously-skip-permissions "prompt"
   
   # New
   opencode run "prompt"
   ```

3. **Rebuild and deploy:**
   ```bash
   docker build -f Dockerfile.runner -t letta-opencode-runner:latest .
   docker compose restart letta-opencode-plugin
   ```

## Future: OpenCode Server Mode

When fully migrated to `opencode serve`:

**Advantages:**
- ✅ HTTP API access
- ✅ Real-time event streaming
- ✅ File access during execution
- ✅ Session management
- ✅ Better resource control

**Current Status:** Infrastructure ready, waiting for stable OpenCode server API

---

**Current Mode:** Docker with `opencode run`  
**CLI Version:** opencode-ai@0.15.0  
**Container Image:** letta-opencode-runner:latest
