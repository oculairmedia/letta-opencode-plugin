# OpenCode CLI Correction ✅

## Issue Discovered

The plugin was incorrectly configured to use **Claude Code** instead of **OpenCode**.

## What Was Fixed

### Configuration Changes

**Before:**
```bash
RUNNER_IMAGE=ghcr.io/anthropics/claude-code:latest
```

**After:**
```bash
RUNNER_IMAGE=letta-opencode-runner:latest
```

### Execution Command

**Before:**
```bash
docker run ... claude --dangerously-skip-permissions "{prompt}"
```

**After:**
```bash
docker run ... opencode run "{prompt}"
```

### Code Changes

**src/execution-manager.ts:**
```typescript
// Before
dockerArgs.push(
  this.config.image,
  "claude",
  "--dangerously-skip-permissions",
  request.prompt
);

// After
dockerArgs.push(
  this.config.image,
  "opencode",
  "run",
  request.prompt
);
```

## New Runner Image

**File:** `Dockerfile.runner`

```dockerfile
FROM node:20-slim

WORKDIR /workspace

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    git curl ca-certificates \
    python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g opencode-ai@0.15.0

RUN groupadd -r opencode && \
    useradd -r -g opencode -m -d /home/opencode opencode && \
    chown -R opencode:opencode /workspace /home/opencode

USER opencode

ENV NODE_ENV=production
ENV HOME=/home/opencode

CMD ["opencode", "run", "echo 'OpenCode runner ready'"]
```

## Why This Matters

1. **OpenCode is the correct tool** for this plugin
2. **Claude Code is not available** as a public Docker image
3. **OpenCode CLI** is installable via npm: `opencode-ai@0.15.0`
4. **OpenCode has better features** for our use case:
   - Headless server mode (`opencode serve`)
   - HTTP API support
   - Session management
   - Model selection

## Deployment

### Build Runner Image

```bash
cd /opt/stacks/letta-opencode-plugin
docker build -f Dockerfile.runner -t letta-opencode-runner:latest .
```

### Rebuild and Deploy

```bash
npm run build
docker compose build letta-opencode-plugin
docker compose up -d
```

### Verify

```bash
# Check OpenCode version in runner
docker run --rm letta-opencode-runner:latest opencode --version
# Output: 0.15.0

# Check service health
curl http://localhost:3500/health
```

## Documentation Updates

Created comprehensive documentation:
- **docs/opencode-cli-usage.md** - Complete OpenCode CLI reference
- **docs/workspace-directories.md** - Workspace management
- **OPENCODE_CORRECTION.md** - This file

## Testing

### Test Runner Image

```bash
docker run --rm letta-opencode-runner:latest opencode --version
```

**Expected Output:** `0.15.0`

### Test Task Execution

```bash
# Create test workspace
mkdir -p /tmp/test-opencode-task

# Run test task
docker run --rm \
  -v /tmp/test-opencode-task:/workspace \
  -w /workspace \
  letta-opencode-runner:latest \
  opencode run "Create a file called test.txt with content 'Hello OpenCode'"

# Verify output
ls /tmp/test-opencode-task/
cat /tmp/test-opencode-task/test.txt
```

## Impact

### Before (Broken)
- ❌ Claude Code image not available
- ❌ Service would fail on task execution
- ❌ No way to run tasks

### After (Working)
- ✅ OpenCode CLI properly installed
- ✅ Tasks execute successfully
- ✅ Files persist in workspace
- ✅ Ready for production use

## Related Files

- `Dockerfile.runner` - OpenCode runner image
- `src/execution-manager.ts` - Execution logic
- `.env` - Configuration
- `compose.yaml` - Docker Compose config
- `docs/opencode-cli-usage.md` - Usage documentation

## Verification Checklist

- [x] OpenCode CLI installed in runner image
- [x] Runner image builds successfully
- [x] OpenCode version command works
- [x] Execution manager uses correct command
- [x] Environment variables updated
- [x] Docker Compose configuration updated
- [x] Service deploys successfully
- [x] Health checks passing
- [x] Documentation updated

## Status

✅ **COMPLETE AND VERIFIED**

The plugin now correctly uses OpenCode CLI for all task executions.

---

**Date:** October 12, 2025
**Issue:** Using wrong CLI tool (claude vs opencode)
**Resolution:** Created custom runner image with OpenCode CLI
**Status:** Deployed and working
