# Docker Deployment Guide

## Overview

The Letta OpenCode Plugin runs as a containerized HTTP MCP server with Docker-in-Docker capabilities for spawning OpenCode execution containers.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2+
- Access to Docker socket (`/var/run/docker.sock`)
- Network: `letta-network` (created automatically)

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Letta API Configuration
LETTA_API_URL=https://letta.oculair.ca
LETTA_API_TOKEN=your_token_here

# OpenCode Runner Configuration
RUNNER_IMAGE=ghcr.io/anthropics/claude-code:latest
RUNNER_CPU_LIMIT=2.0
RUNNER_MEMORY_LIMIT=2g
RUNNER_TIMEOUT_MS=300000

# Task Queue
MAX_CONCURRENT_TASKS=3

# Server Configuration
MCP_PORT=3500
MCP_HOST=0.0.0.0

# Feature Flags
DEBUG=false
ENABLE_ASYNC_EXECUTE=true
ENFORCE_IDEMPOTENCY=true
```

## Deployment

### Using Docker Compose

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

### Using Dockge

1. Navigate to Dockge UI
2. Add stack directory: `/opt/stacks/letta-opencode-plugin`
3. Configure environment variables
4. Click "Deploy"

## Health Checks

The container includes built-in health checks:

```bash
# Check via Docker
docker inspect letta-opencode-plugin --format='{{.State.Health.Status}}'

# Check via HTTP
curl http://localhost:3500/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "letta-opencode-plugin",
  "transport": "streamable_http",
  "protocol_version": "2025-06-18",
  "sessions": 0,
  "uptime": 123.45,
  "timestamp": "2025-10-12T05:26:33.579Z",
  "security": {
    "origin_validation": true,
    "localhost_binding": true
  }
}
```

## Architecture Notes

### Docker Socket Mount

The container mounts `/var/run/docker.sock` to spawn OpenCode execution containers:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Security Consideration:** This grants the container Docker daemon access. Ensure:
- Container runs as non-root user (`letta`)
- Network isolation via `letta-network`
- Resource limits enforced in `compose.yaml`

### Network Configuration

Uses external network `letta-network` for isolation:

```bash
# Create network manually if needed
docker network create letta-network
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :3500

# Change port in .env
MCP_PORT=3501
```

### Docker Socket Permission Denied

```bash
# Add letta user to docker group (inside container)
docker exec -u root letta-opencode-plugin usermod -aG docker letta

# Restart container
docker compose restart
```

### Container Not Spawning Execution Containers

```bash
# Check Docker socket mount
docker inspect letta-opencode-plugin | jq '.[0].Mounts'

# Test Docker access from container
docker exec letta-opencode-plugin docker ps
```

## Monitoring

### Container Logs

```bash
# Follow logs
docker compose logs -f

# Last 100 lines
docker compose logs --tail=100

# Specific service
docker logs letta-opencode-plugin
```

### Resource Usage

```bash
# Real-time stats
docker stats letta-opencode-plugin

# Inspect resource limits
docker inspect letta-opencode-plugin | jq '.[0].HostConfig.Memory'
```

## Production Recommendations

1. **Use External Volumes** for persistent task data
2. **Enable Prometheus Metrics** (future feature)
3. **Configure Log Rotation** via Docker daemon
4. **Monitor Health Endpoint** with external monitoring
5. **Use Secrets Management** for `LETTA_API_TOKEN`

## Image Registry

To publish to a registry:

```bash
# Tag image
docker tag letta-opencode-plugin-letta-opencode-plugin ghcr.io/your-org/letta-opencode-plugin:latest

# Push
docker push ghcr.io/your-org/letta-opencode-plugin:latest

# Update compose.yaml to use published image
services:
  letta-opencode-plugin:
    image: ghcr.io/your-org/letta-opencode-plugin:latest
    # Remove build section
```
