# Workspace Directories

## Overview

When executing tasks, the Letta OpenCode Plugin creates persistent workspace directories for each task to store files, code, and artifacts generated during execution.

## Directory Structure

### Docker Mode

```
/opt/stacks/                       # Base workspace directory (configurable)
├── task-{timestamp}-{id}/         # Per-task workspace
│   ├── {files created by opencode}  # All task artifacts
│   └── ...
├── task-{timestamp}-{id2}/
└── ...
```

### OpenCode Server Mode

```
/workspace/                         # Inside opencode-server container
└── {session-specific-files}       # Managed by OpenCode server
```

## Configuration

### Environment Variable

```bash
# Set custom workspace base directory
WORKSPACE_DIR=/path/to/workspaces
```

**Default:** `/opt/stacks`

### Docker Mode Behavior

When a task is executed:

1. **Workspace Creation**: A directory is created at `${WORKSPACE_DIR}/${taskId}`
2. **Volume Mount**: The directory is mounted into the container at `/workspace`
3. **Working Directory**: Container starts in `/workspace`
4. **Persistence**: Files persist after task completion (container is removed with `--rm`)

### Docker Run Command

```bash
docker run \
  --rm \
  --name opencode-{taskId}-{timestamp} \
  -v /opt/stacks/{taskId}:/workspace \
  -w /workspace \
  letta-opencode-runner:latest \
  opencode run "{prompt}"
```

## File Operations

### Docker Mode (Current)

**Read Files:**
- Not directly accessible during execution
- Output captured via stdout/stderr only

**Access After Completion:**
```bash
# Files remain on host filesystem
ls /tmp/opencode-workspaces/task-123/

# Can be retrieved for archival
tar -czf task-123.tar.gz /tmp/opencode-workspaces/task-123/
```

### OpenCode Server Mode (When Available)

**Read Files During Execution:**
```typescript
// List files
const files = await getTaskFiles({ task_id: "task-123" });

// Read file content
const content = await readTaskFile({ 
  task_id: "task-123",
  file_path: "output.txt" 
});
```

## Cleanup

### Manual Cleanup

```bash
# Remove all workspaces
rm -rf /tmp/opencode-workspaces/*

# Remove specific task workspace
rm -rf /tmp/opencode-workspaces/task-123
```

### Automatic Cleanup (Not Yet Implemented)

Future enhancement could include:
- Automatic cleanup after N days
- Size-based rotation
- Configurable retention policy

## Storage Considerations

### Disk Usage

- Each task creates a new workspace directory
- Workspaces persist indefinitely (manual cleanup required)
- Average workspace size: 1-100MB depending on task

### Recommendations

**Development:**
- Use `/tmp/opencode-workspaces` (auto-cleared on reboot)
- Monitor disk usage: `du -sh /tmp/opencode-workspaces`

**Production:**
- Use dedicated volume: `/var/lib/opencode-workspaces`
- Implement cleanup cron job
- Monitor with disk alerts

## Docker Compose Configuration

### Add Workspace Volume

```yaml
services:
  letta-opencode-plugin:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - opencode-workspaces:/tmp/opencode-workspaces  # Add this

volumes:
  opencode-workspaces:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/lib/opencode-workspaces  # Host path
```

### Alternative: Bind Mount

```yaml
services:
  letta-opencode-plugin:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /var/lib/opencode-workspaces:/tmp/opencode-workspaces
```

## Security Considerations

### Permissions

- Workspace directories inherit parent directory permissions
- Container runs as user specified in claude-code image
- Host user must have read/write access to workspace directory

### Isolation

- Each task gets its own isolated directory
- No cross-task file access
- Container removed after execution (`--rm`)
- Files persist on host for review/archival

### Sensitive Data

⚠️ **Warning:** Workspace directories may contain:
- Source code
- API keys or credentials (if task involves them)
- Sensitive outputs

**Recommendations:**
1. Use encrypted filesystem for workspace directory
2. Implement cleanup policy for sensitive tasks
3. Review workspace contents before archival
4. Never commit workspace directories to git

## Archival Integration

### Archive Task Workspace

```typescript
// After task completion
const archivePath = await archiveTaskWorkspace({
  taskId: "task-123",
  destination: "/archives/task-123.tar.gz"
});

// Cleanup original workspace
await cleanupTaskWorkspace({ taskId: "task-123" });
```

### Integration with get_task_history

```typescript
// When include_artifacts: true
const history = await getTaskHistory({
  task_id: "task-123",
  include_artifacts: true
});

// Returns workspace files as artifacts
history.artifacts.forEach(artifact => {
  console.log(artifact.name, artifact.content);
});
```

## Troubleshooting

### "Permission denied" errors

**Problem:** Container cannot write to mounted workspace

**Solution:**
```bash
# Ensure workspace directory is writable
sudo chmod 777 /tmp/opencode-workspaces

# Or create with correct ownership
sudo mkdir -p /tmp/opencode-workspaces
sudo chown -R $(id -u):$(id -g) /tmp/opencode-workspaces
```

### Workspace not persisting

**Problem:** Files disappear after task completes

**Solution:** Verify volume mount is correct:
```bash
# Check running container mounts
docker inspect {container-id} | jq '.[0].Mounts'

# Should show:
# {
#   "Type": "bind",
#   "Source": "/tmp/opencode-workspaces/task-123",
#   "Destination": "/workspace",
#   "Mode": "",
#   "RW": true
# }
```

### Disk space issues

**Problem:** `/tmp` fills up with workspaces

**Solution:**
1. Change `WORKSPACE_DIR` to dedicated volume
2. Implement cleanup script:
```bash
# Cleanup workspaces older than 7 days
find /tmp/opencode-workspaces -type d -mtime +7 -exec rm -rf {} +
```

## Future Enhancements

### Planned Features

1. **Workspace Manager Service**
   - Automatic cleanup based on age/size
   - Compression of old workspaces
   - Upload to S3/object storage

2. **File Access Tools** (OpenCode Server)
   - Real-time file listing during execution
   - File content reading
   - File modification tracking

3. **Workspace Snapshots**
   - Before/after comparison
   - Incremental backups
   - Diff visualization

4. **Quota Management**
   - Per-agent workspace limits
   - Storage alerts
   - Automatic cleanup triggers

---

**Current Status:** Basic workspace persistence implemented  
**Mode:** Docker mode (OpenCode server mode ready)  
**Storage:** `/tmp/opencode-workspaces` (configurable)
