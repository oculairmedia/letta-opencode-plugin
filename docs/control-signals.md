# OpenCode Control Signals

## Overview

The Letta OpenCode Plugin supports control signals to manage task execution. The behavior differs between legacy Docker execution and OpenCode server execution.

## Control Signal Types

### 1. Cancel
**Action:** Terminates the task immediately

**Docker Mode:**
- Sends SIGKILL to container
- Container removed immediately
- No cleanup operations performed

**OpenCode Server Mode:**
- Calls `session.abort()` on OpenCode server
- Session terminated gracefully
- Workspace state preserved

**Usage:**
```json
{
  "task_id": "task-123",
  "control": "cancel",
  "reason": "User cancelled operation"
}
```

### 2. Pause
**Action:** Temporarily suspends task execution

**Docker Mode:**
- Uses `docker pause` command
- Freezes all processes in container
- No cleanup, container remains in memory

**OpenCode Server Mode:**
- ⚠️ **NOT SUPPORTED**
- Returns error: "Pause not supported for OpenCode server sessions"
- Use cancel/restart workflow instead

**Usage:**
```json
{
  "task_id": "task-123",
  "control": "pause",
  "reason": "Need to review progress"
}
```

### 3. Resume
**Action:** Resumes a paused task

**Docker Mode:**
- Uses `docker unpause` command
- Restores all processes in container
- Continues from exact point of pause

**OpenCode Server Mode:**
- ⚠️ **NOT SUPPORTED**
- Returns error: "Resume not supported for OpenCode server sessions"
- Use cancel/restart workflow instead

**Usage:**
```json
{
  "task_id": "task-123",
  "control": "resume",
  "reason": "Ready to continue"
}
```

## Implementation Details

### ExecutionManager Methods

```typescript
// Cancel task (both modes)
await execution.cancelTask(taskId);

// Pause task (Docker only)
await execution.pauseTask(taskId);

// Resume task (Docker only)
await execution.resumeTask(taskId);
```

### OpenCode Server Limitations

The OpenCode HTTP server does not support pause/resume operations because:
1. Sessions are stateful and cannot be frozen mid-execution
2. WebSocket connections would be terminated
3. Event streaming would be interrupted
4. Workspace state management complexity

### Recommended Workflow for OpenCode Server

Instead of pause/resume, use:
1. **Cancel** the current task
2. Review workspace state and artifacts
3. Create **new task** with updated context

## Status Updates

Control signals update task status in TaskRegistry:

| Signal | New Status | Final |
|--------|-----------|-------|
| cancel | cancelled | Yes   |
| pause  | paused    | No    |
| resume | running   | No    |

## Matrix Integration

When Matrix integration is enabled:
- Control signals are broadcast to task room
- Human observers notified of status changes
- Workspace updates sent automatically

## Migration Notes

When migrating from Docker mode to OpenCode server mode:
- Remove pause/resume logic from agents
- Update task monitoring to handle cancel-only workflow
- Consider implementing checkpointing for long-running tasks
