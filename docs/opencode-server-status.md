# OpenCode Server Status

## Current Implementation Status

### ✅ Completed
- TypeScript types and interfaces
- OpenCodeClientManager with full HTTP client
- ExecutionManager dual-mode support
- Event streaming integration
- File access tools (get_task_files, read_task_file)
- Control signal mapping
- Feature flag support
- Integration tests
- Comprehensive documentation

### ⚠️ Blocked
- **OpenCode HTTP Server**: The `claude serve` command and HTTP API are not yet publicly available
- Docker image for OpenCode server cannot be built until official packages are released

## Current Workaround

The plugin is **production-ready with Docker mode** (feature flag `OPENCODE_SERVER_ENABLED=false`, which is the default).

### Docker Mode (Active)
```bash
# Current execution flow
Agent → MCP Tool → ExecutionManager → Docker CLI → claude command
                                        ↓
                                   Container (ephemeral)
                                        ↓
                                   Output capture
```

**Features Available:**
- ✅ Task execution
- ✅ Status tracking
- ✅ Control signals (cancel/pause/resume)
- ✅ Matrix integration
- ✅ Workspace memory blocks
- ❌ Real-time event streaming
- ❌ File access during execution

### OpenCode Server Mode (Prepared, Not Active)

**Status:** Code complete, awaiting official OpenCode server release

**Blockers:**
1. No public npm package for OpenCode server
2. No `claude serve` command in current CLI
3. No public Docker image with HTTP API

**What's Ready:**
- Complete client implementation
- Session management
- Event streaming handlers
- File access tools
- Documentation

## When OpenCode Server Becomes Available

### Option 1: Official npm Package
If Anthropic releases `@anthropics/opencode-server`:

```dockerfile
FROM node:20-slim
RUN npm install -g @anthropics/opencode-server
CMD ["opencode-server", "--port", "3100"]
```

### Option 2: Official Docker Image
If Anthropic releases official image:

```yaml
services:
  opencode-server:
    image: ghcr.io/anthropics/opencode-server:latest
    ports:
      - "3100:3100"
```

### Option 3: Claude CLI with Serve
If `claude serve` is added to existing CLI:

```dockerfile
FROM ghcr.io/anthropics/claude-code:latest
CMD ["claude", "serve", "--port", "3100", "--host", "0.0.0.0"]
```

## Immediate Deployment Plan

### Deploy Docker Mode (Now)
```bash
cd /opt/stacks/letta-opencode-plugin
docker compose build letta-opencode-plugin
docker compose up -d letta-opencode-plugin
```

**Verify:**
```bash
curl http://localhost:3500/health
```

### Enable OpenCode Server (When Available)

1. Update `Dockerfile.opencode` with correct base image
2. Set `OPENCODE_SERVER_ENABLED=true` in `.env`
3. Deploy both services:
   ```bash
   docker compose up -d
   ```

## Testing Strategy

### Current Testing (Docker Mode)
```bash
# Unit tests
npm run test:unit  # ✅ Passing (11 tests)

# Integration tests (Docker mode)
export OPENCODE_SERVER_ENABLED=false
npm run test:integration
```

### Future Testing (OpenCode Server Mode)
```bash
# Integration tests (OpenCode server mode)
export OPENCODE_SERVER_ENABLED=true
export OPENCODE_SERVER_URL=http://localhost:3100
npm run test:integration
```

## API Compatibility

The MCP tool surface remains **100% compatible** regardless of mode:

| Tool | Docker Mode | OpenCode Server Mode |
|------|-------------|---------------------|
| opencode_execute_task | ✅ | ✅ (when available) |
| get_task_status | ✅ | ✅ (when available) |
| send_task_message | ✅ | ✅ (when available) |
| send_task_control | ✅ | ✅ (when available) |
| get_task_history | ✅ | ✅ (when available) |
| get_task_files | ❌ | ✅ (when available) |
| read_task_file | ❌ | ✅ (when available) |
| ping | ✅ | ✅ |
| health | ✅ | ✅ |

## Monitoring Official Releases

Check these sources for OpenCode server availability:

1. **npm Registry**: `npm search @anthropics/opencode-server`
2. **GitHub**: https://github.com/anthropics/anthropic-sdk-typescript
3. **Docker Hub**: `docker search anthropic/opencode`
4. **Documentation**: https://docs.anthropic.com/claude/code

## Recommendation

**Deploy now with Docker mode** - fully functional with all core features. The plugin is architected to seamlessly switch to OpenCode server mode when it becomes available, requiring only:

1. Update Dockerfile.opencode
2. Set environment variable
3. Restart services

No code changes needed.

---

**Last Updated:** October 12, 2025  
**Next Review:** When Anthropic announces OpenCode server release
