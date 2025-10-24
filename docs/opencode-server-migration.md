# OpenCode Server Migration Guide

## Overview

The Letta OpenCode Plugin now supports two execution modes:
1. **Legacy Docker Mode** - Direct `claude` CLI execution in containers
2. **OpenCode Server Mode** - HTTP-based OpenCode server with SDK integration

## Feature Flag

Control execution mode via environment variable:

```bash
# Disable OpenCode server (use legacy Docker mode)
OPENCODE_SERVER_ENABLED=false

# Enable OpenCode server (use HTTP API + SDK)
OPENCODE_SERVER_ENABLED=true
OPENCODE_SERVER_URL=http://opencode-server:3100
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_SERVER_ENABLED` | `false` | Enable OpenCode server mode |
| `OPENCODE_SERVER_URL` | `http://opencode-server:3100` | OpenCode server HTTP endpoint |
| `OPENCODE_SERVER_HEALTH_CHECK_INTERVAL_MS` | `5000` | Health check interval |
| `OPENCODE_SERVER_MAX_RETRIES` | `3` | Max connection retries |
| `OPENCODE_SERVER_RETRY_DELAY_MS` | `1000` | Retry delay |

### Docker Compose

The plugin now deploys two services:

```yaml
services:
  letta-opencode-plugin:
    # MCP server
    depends_on:
      opencode-server:
        condition: service_healthy

  opencode-server:
    # OpenCode HTTP server
    build:
      dockerfile: Dockerfile.opencode
    ports:
      - "3100:3100"
```

## Deployment Strategy

### Blue/Green Deployment

1. **Phase 1: Parallel Testing** (Current)
   - Both modes available
   - Feature flag defaults to `false` (Docker mode)
   - Test OpenCode server mode with non-critical tasks

2. **Phase 2: Canary Rollout**
   - Enable OpenCode server for 10% of tasks
   - Monitor metrics: latency, error rate, resource usage
   - Gradually increase to 50%, then 100%

3. **Phase 3: Full Migration**
   - Set `OPENCODE_SERVER_ENABLED=true` by default
   - Keep Docker mode as fallback
   - Remove legacy code after 30 days

### Rollback Plan

If issues occur:
```bash
# Immediate rollback
docker compose down
export OPENCODE_SERVER_ENABLED=false
docker compose up -d
```

## Feature Comparison

| Feature | Docker Mode | OpenCode Server Mode |
|---------|-------------|---------------------|
| Task execution | ✅ | ✅ |
| Event streaming | ❌ | ✅ |
| File access | ❌ | ✅ |
| Pause/Resume | ✅ | ❌ |
| Cancel | ✅ | ✅ |
| Matrix integration | ✅ | ✅ |
| Resource limits | ✅ | ✅ |
| Session management | ❌ | ✅ |

## Migration Checklist

### Pre-Migration

- [ ] Deploy OpenCode server container
- [ ] Verify health endpoint: `curl http://opencode-server:3100/health`
- [ ] Test with `OPENCODE_SERVER_ENABLED=true` in dev environment
- [ ] Update agent documentation (remove pause/resume references)
- [ ] Train agents on new file access tools

### Migration

- [ ] Enable feature flag in staging
- [ ] Run integration tests
- [ ] Monitor logs for errors
- [ ] Verify workspace events are streaming correctly
- [ ] Test file access tools

### Post-Migration

- [ ] Monitor task success rate
- [ ] Compare performance metrics
- [ ] Collect agent feedback
- [ ] Document any issues
- [ ] Plan legacy code removal

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
# Test Docker mode
export OPENCODE_SERVER_ENABLED=false
npm run test:integration

# Test OpenCode server mode
export OPENCODE_SERVER_ENABLED=true
npm run test:integration
```

### Manual Testing

1. Create test task with OpenCode server:
```bash
curl -X POST http://localhost:3500/v1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "opencode_execute_task",
    "arguments": {
      "agent_id": "test-agent",
      "task_description": "List files in current directory",
      "sync": true
    }
  }'
```

2. Check event streaming:
```bash
# Watch logs for OpenCode events
docker logs -f letta-opencode-plugin
```

3. Test file access:
```bash
curl -X POST http://localhost:3500/v1/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_task_files",
    "arguments": {
      "task_id": "task-123"
    }
  }'
```

## Troubleshooting

### OpenCode Server Not Starting

Check logs:
```bash
docker logs opencode-server
```

Common issues:
- Port 3100 already in use
- Missing `@anthropics/opencode` package
- Health check timeout

### Event Streaming Issues

Verify EventSource connection:
```bash
curl -N http://opencode-server:3100/session/{sessionId}/events
```

### File Access Errors

Check container permissions:
```bash
docker exec opencode-server ls -la /workspace
```

## Performance Metrics

Monitor these metrics during migration:

| Metric | Docker Mode | OpenCode Server Mode | Target |
|--------|-------------|---------------------|--------|
| Task latency | ~2s | ~1.5s | <2s |
| Memory usage | 500MB | 400MB | <600MB |
| CPU usage | 1.5 cores | 1.2 cores | <2 cores |
| Success rate | 95% | 95%+ | >95% |

## Support

For issues or questions:
- GitHub: https://github.com/oculairmedia/letta-opencode-plugin/issues
- Docs: `/opt/stacks/letta-opencode-plugin/docs/`
- Logs: `docker logs letta-opencode-plugin`
