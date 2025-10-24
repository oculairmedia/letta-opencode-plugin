# Workspace Configuration

## Default Workspace: /opt/stacks

### Why /opt/stacks?

The plugin uses `/opt/stacks` as the default workspace directory because:

1. **Infrastructure Location** - All your stacks are in `/opt/stacks`
2. **Persistent Storage** - Not in `/tmp`, files persist properly
3. **Cross-Stack Access** - Tasks can reference other stacks/projects
4. **Consistent Layout** - Matches your existing infrastructure setup

### Directory Structure

```
/opt/stacks/
├── letta-opencode-plugin/        # This plugin (MCP server)
├── matrix-synapse-deployment/    # Matrix coordination server
├── mcp-filesystem-server/        # MCP filesystem access
├── other-infrastructure/         # Other stacks...
│
└── task-{timestamp}-{id}/        # Task workspaces (created dynamically)
    ├── .git/                     # If task initializes git
    ├── src/                      # Source files created
    ├── package.json              # If task creates Node project
    └── ...                       # Other task artifacts
```

### Task Execution Flow

#### 1. Task Request

```typescript
const request: ExecutionRequest = {
  taskId: "task-1697123456789-abc123",
  agentId: "agent-456",
  prompt: "Create a new Express API in /opt/stacks/my-api",
  workspaceBlockId: "block-789"
};
```

#### 2. Workspace Creation

The execution manager:
- Creates directory: `/opt/stacks/task-1697123456789-abc123/`
- Mounts to container: `-v /opt/stacks/task-1697123456789-abc123:/workspace`
- Sets working directory: `-w /workspace`

#### 3. OpenCode Execution

```bash
docker run --rm \
  --name opencode-task-1697123456789-abc123-{timestamp} \
  -v /opt/stacks/task-1697123456789-abc123:/workspace \
  -w /workspace \
  --cpus 2.0 \
  --memory 2g \
  letta-opencode-runner:latest \
  opencode run "Create a new Express API"
```

#### 4. File Persistence

After task completes:
- Container removed (`--rm` flag)
- Files remain in `/opt/stacks/task-{id}/`
- Accessible for review, archival, or future reference

### Configuration

#### Environment Variable

```bash
# .env
WORKSPACE_DIR=/opt/stacks
```

#### Docker Compose Mount

```yaml
services:
  letta-opencode-plugin:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/stacks:/opt/stacks  # Full access to stacks directory
```

### Cross-Stack Access

Tasks running in `/opt/stacks/{taskId}` can access other stacks:

```bash
# Inside task container at /workspace
ls -la ../letta-opencode-plugin/     # Access plugin stack
ls -la ../matrix-synapse-deployment/ # Access Matrix stack
cd ../my-other-project/              # Work with other projects
```

### Use Cases

#### 1. Create New Stack

```typescript
await executeTask({
  agent_id: "agent-123",
  task_description: "Create a new Docker stack in /opt/stacks/my-new-service with Dockerfile and compose.yaml"
});
```

**Result:**
```
/opt/stacks/my-new-service/
├── Dockerfile
├── compose.yaml
└── README.md
```

#### 2. Modify Existing Stack

```typescript
await executeTask({
  agent_id: "agent-123",
  task_description: "Update the /opt/stacks/letta-opencode-plugin to add a new MCP tool"
});
```

**Result:** Plugin code updated in place

#### 3. Development Task

```typescript
await executeTask({
  agent_id: "agent-123",
  task_description: "Create a Python data processing script"
});
```

**Result:**
```
/opt/stacks/task-{id}/
├── process_data.py
├── requirements.txt
└── test_data.csv
```

### File Management

#### Listing Task Workspaces

```bash
# List all task directories
ls -ld /opt/stacks/task-*

# List with details
ls -lah /opt/stacks/task-*/
```

#### Accessing Task Files

```bash
# Navigate to task workspace
cd /opt/stacks/task-1697123456789-abc123

# View files
ls -la

# Archive task
tar -czf task-archive.tar.gz /opt/stacks/task-1697123456789-abc123/

# Cleanup old tasks
find /opt/stacks -name "task-*" -type d -mtime +30 -exec rm -rf {} +
```

### Permissions

#### Host Permissions

The `/opt/stacks` directory should be:
- Readable/writable by the Docker daemon
- Owned by root or infrastructure user
- Permission: `755` or `777` (if multiple users)

```bash
# Check permissions
ls -ld /opt/stacks

# Fix if needed
sudo chmod 755 /opt/stacks
```

#### Container Permissions

Inside containers:
- User: `opencode` (non-root)
- Working directory: `/workspace` (mounted from host)
- Home: `/home/opencode`

### Advantages Over /tmp

| Aspect | /tmp/opencode-workspaces | /opt/stacks |
|--------|--------------------------|-------------|
| **Persistence** | Cleared on reboot | Permanent |
| **Accessibility** | Isolated | Can access other stacks |
| **Organization** | Separate location | Unified infrastructure |
| **Cleanup** | Auto-cleared | Manual (intentional) |
| **Cross-reference** | Difficult | Easy |

### Cleanup Strategy

#### Manual Cleanup

```bash
# Remove specific task
rm -rf /opt/stacks/task-1697123456789-abc123

# Remove all tasks older than 30 days
find /opt/stacks -name "task-*" -type d -mtime +30 -exec rm -rf {} +
```

#### Automated Cleanup (Recommended)

Create cron job:
```bash
# /etc/cron.daily/cleanup-opencode-tasks
#!/bin/bash
find /opt/stacks -name "task-*" -type d -mtime +30 -delete
```

### Monitoring

#### Disk Usage

```bash
# Check total workspace size
du -sh /opt/stacks/task-*

# Find largest task workspaces
du -sh /opt/stacks/task-* | sort -rh | head -10
```

#### Active Tasks

```bash
# List currently running task containers
docker ps | grep "opencode-task-"

# Check specific task
docker inspect opencode-task-{id}-{timestamp}
```

### Troubleshooting

#### Permission Denied Errors

**Problem:** Container can't write to `/workspace`

**Solution:**
```bash
sudo chmod -R 777 /opt/stacks
# Or more specific
sudo chmod 777 /opt/stacks/task-{id}
```

#### Disk Space Issues

**Problem:** `/opt/stacks` filling up

**Solution:**
```bash
# Check disk usage
df -h /opt

# Clean up old tasks
find /opt/stacks -name "task-*" -type d -mtime +7 -exec rm -rf {} +
```

#### Can't Access Other Stacks

**Problem:** Task container can't see other stacks

**Verify:**
```bash
# Check Docker volume mount
docker inspect {container-id} | jq '.[0].Mounts'

# Should show:
# {
#   "Type": "bind",
#   "Source": "/opt/stacks",
#   "Destination": "/opt/stacks",
#   "Mode": "",
#   "RW": true
# }
```

### Future Enhancements

#### Planned Features

1. **Workspace Quota Management**
   - Per-task size limits
   - Agent-level quota enforcement
   - Automatic cleanup triggers

2. **Workspace Snapshots**
   - Before/after comparison
   - Git integration for version control
   - Incremental backups

3. **Smart Organization**
   - Group tasks by agent
   - Organize by project/stack
   - Tag-based categorization

4. **Workspace Analytics**
   - Storage usage reports
   - File change tracking
   - Task artifact analysis

---

**Current Configuration:**
- Default: `/opt/stacks`
- Configurable: `WORKSPACE_DIR` environment variable
- Mounted: Full `/opt/stacks` directory access
- Persistence: Permanent (manual cleanup required)

**Status:** ✅ Configured and working
