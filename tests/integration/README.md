# Integration Tests

## Overview

Integration tests verify the OpenCode server migration by testing both Docker mode and OpenCode server mode execution.

## Running Tests

### All Tests
```bash
npm run test:integration
```

### Docker Mode Only
```bash
export OPENCODE_SERVER_ENABLED=false
npm run test:integration
```

### OpenCode Server Mode Only
```bash
export OPENCODE_SERVER_ENABLED=true
export OPENCODE_SERVER_URL=http://localhost:3100
npm run test:integration
```

## Prerequisites

### For Docker Mode Tests
- Docker daemon running
- Access to `/var/run/docker.sock`
- Claude Code image available: `ghcr.io/anthropics/claude-code:latest`

### For OpenCode Server Tests
- OpenCode server running on port 3100
- Health endpoint responding: `curl http://localhost:3100/health`
- Sufficient disk space for workspace volumes

## Test Suites

### 1. Health Check
Verifies OpenCode server connectivity and health endpoint.

**Tests:**
- Server responds to health checks
- Health endpoint returns expected format

### 2. Task Execution
Tests basic task execution in both modes.

**Tests:**
- Simple command execution
- Task timeout handling
- Output capture
- Error handling

### 3. Event Streaming
Validates real-time event streaming (OpenCode server mode only).

**Tests:**
- Events received during execution
- Event types are correct
- Event data is well-formed

### 4. File Access
Tests workspace file operations (OpenCode server mode only).

**Tests:**
- List files in workspace
- Read file content
- File metadata

### 5. Control Signals
Verifies control signal handling.

**Tests:**
- Cancel running tasks
- Pause/resume (Docker mode only)
- Status updates

### 6. Container Info
Tests container tracking and metadata.

**Tests:**
- Active task tracking
- Container info retrieval
- Session management

## Test Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_SERVER_ENABLED` | `false` | Enable OpenCode server mode |
| `OPENCODE_SERVER_URL` | `http://localhost:3100` | OpenCode server URL |

### Timeouts

All tests have extended timeouts to handle:
- Container startup time
- Task execution time
- Network latency

Default timeout: 60 seconds per test

## Expected Results

### Docker Mode
- ✅ All tests except event streaming and file access
- ⚠️ Pause/resume tests pass
- ❌ File access tests skipped

### OpenCode Server Mode
- ✅ All tests except pause/resume
- ✅ Event streaming tests pass
- ✅ File access tests pass
- ❌ Pause/resume tests skipped

## Troubleshooting

### Tests Timeout
- Increase test timeout in jest.config.js
- Check Docker daemon is running
- Verify OpenCode server is healthy

### Connection Refused
- Ensure OpenCode server is running: `docker ps | grep opencode`
- Check server logs: `docker logs opencode-server`
- Verify port 3100 is not blocked

### File Access Errors
- Check workspace volume permissions
- Ensure container has write access
- Verify disk space available

## CI/CD Integration

### GitHub Actions

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        mode: [docker, opencode-server]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      
      - name: Install dependencies
        run: npm ci
      
      - name: Start OpenCode server
        if: matrix.mode == 'opencode-server'
        run: |
          docker compose up -d opencode-server
          sleep 10
      
      - name: Run tests
        env:
          OPENCODE_SERVER_ENABLED: ${{ matrix.mode == 'opencode-server' }}
        run: npm run test:integration
```

## Code Coverage

Target coverage: >80% for execution-manager.ts

View coverage report:
```bash
npm run test:coverage
```

## Contributing

When adding new features:
1. Write integration tests first (TDD)
2. Ensure tests pass in both modes
3. Document expected behavior
4. Update this README
