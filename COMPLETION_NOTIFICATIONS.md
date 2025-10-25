# Automatic Task Completion Notifications

**Date**: October 24, 2025  
**Commit**: `fbd066a` - Add automatic completion notification to calling agent  
**Status**: ✅ DEPLOYED

## Overview

The Letta OpenCode Plugin now **automatically notifies the calling agent** when a task completes, regardless of success or failure. This eliminates the need for agents to poll for task status.

## How It Works

### Previous Behavior ❌
1. Agent calls `opencode_execute_task` (async mode)
2. Tool returns immediately with `task_id`
3. Task executes in background
4. **Agent has no idea when task completes** ❌
5. Agent must repeatedly call `get_task_status` to check
6. Relied on OpenCode's Claude agent to message back (unreliable)

### New Behavior ✅
1. Agent calls `opencode_execute_task` (async mode)
2. Tool returns immediately with `task_id`
3. Task executes in background
4. **When task completes, plugin automatically sends message to calling agent** ✅
5. Agent receives formatted notification with results
6. No polling required!

## Notification Format

### Success Notification
```
✅ OpenCode Task Completed Successfully

Task ID: task-1761348209833-9945rtjcj
Description: Create a simple hello world Python script
Duration: 45230ms
Status: completed
Exit Code: 0

Output:
Created hello.py successfully
File contains: print("Hello, World!")

... (truncated, use get_task_history for full output)
```

### Failure Notification
```
❌ OpenCode Task Failed

Task ID: task-1761348209833-9945rtjcj
Description: Create a simple hello world Python script
Duration: 12500ms
Status: failed
Exit Code: 1

Output:
Error: Permission denied when writing to /workspace/hello.py

Error: Permission error during file creation
```

### Timeout Notification
```
⏱️ OpenCode Task Timed Out

Task ID: task-1761348209833-9945rtjcj
Description: Create a complex refactoring task
Duration: 300000ms
Status: timeout

Output:
Started refactoring process...
Analyzing 45 files...

... (truncated, use get_task_history for full output)
```

## Implementation Details

### Notification Timing
- Sent **immediately after task execution completes**
- Sent **before workspace block is detached**
- Sent via Letta's `agents.messages.create` API

### Message Details
- **Role**: `user` (appears as if user sent the message)
- **Content**: Formatted markdown with emoji status indicator
- **Includes**:
  - Task ID for reference
  - Original task description
  - Execution duration in milliseconds
  - Final status (completed/failed/timeout)
  - Exit code (if available)
  - Output preview (first 1000 characters)
  - Error message (if failed)
  - Hint to use `get_task_history` for full output if truncated

### Error Handling
- If notification fails to send, error is logged but **doesn't fail the task**
- Task result is still returned/stored correctly
- Workspace block updates still occur

## Benefits

### For Agents
1. **No polling required** - Agent immediately knows when task completes
2. **Automatic updates** - Don't need to remember to check status
3. **Context preserved** - Notification includes task description and ID
4. **Quick feedback** - See output preview without additional API calls

### For Users
1. **Better user experience** - Agents can respond immediately
2. **Reduced API calls** - No repeated `get_task_status` polling
3. **Clearer communication** - Agents can act on results right away

## Code Changes

### File: `src/tools/execute-task.ts`

**Lines 294-310**: Send completion notification
```typescript
// Send completion notification to the calling agent
try {
  const notificationMessage = formatCompletionNotification(
    taskId,
    finalStatus,
    result,
    params.task_description
  );
  
  await deps.letta.sendMessage(params.agent_id, {
    role: "user",
    content: notificationMessage,
  });
  console.log(`[execute-task] Sent completion notification to agent ${params.agent_id}`);
} catch (notificationError) {
  console.error(`[execute-task] Failed to send completion notification:`, notificationError);
}
```

**Lines 323-343**: Send failure notification
```typescript
// Send failure notification to the calling agent
try {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const notificationMessage = `🚨 OpenCode Task Failed
  
Task ID: ${taskId}
Description: ${params.task_description}
Error: ${errorMessage}`;
  
  await deps.letta.sendMessage(params.agent_id, {
    role: "user",
    content: notificationMessage,
  });
} catch (notificationError) {
  console.error(`[execute-task] Failed to send failure notification:`, notificationError);
}
```

**Lines 354-404**: Helper function
```typescript
function formatCompletionNotification(
  taskId: string,
  status: string,
  result: any,
  taskDescription: string
): string {
  const emoji = status === "completed" ? "✅" : 
                status === "timeout" ? "⏱️" : "❌";
  const statusText = status === "completed" ? "Completed Successfully" : 
                     status === "timeout" ? "Timed Out" : "Failed";
  
  let message = `${emoji} OpenCode Task ${statusText}

Task ID: ${taskId}
Description: ${taskDescription}
Duration: ${result.durationMs}ms
Status: ${status}`;

  if (result.exitCode !== undefined) {
    message += `\nExit Code: ${result.exitCode}`;
  }

  if (result.output) {
    const outputPreview = result.output.slice(0, 1000);
    message += `\n\nOutput:\n${outputPreview}`;
    if (result.output.length > 1000) {
      message += `\n\n... (truncated, use get_task_history for full output)`;
    }
  }

  if (result.error) {
    message += `\n\nError: ${result.error}`;
  }

  return message;
}
```

## Testing

### Test with Meridian
```
@Meridian Use opencode_execute_task to create a test.txt file with "Hello from OpenCode"
```

**Expected Flow**:
1. Tool returns immediately: `{ task_id: "task-...", status: "queued" }`
2. Task executes in background
3. After ~10-30 seconds, **Meridian receives automatic notification**:
   ```
   ✅ OpenCode Task Completed Successfully
   
   Task ID: task-1761348209833-xyz
   Description: Create a test.txt file with "Hello from OpenCode"
   Duration: 15234ms
   Status: completed
   Exit Code: 0
   
   Output:
   Created test.txt successfully
   ```
4. Meridian can now respond to user based on results

## Monitoring

### Check Notification Logs
```bash
docker logs letta-opencode-plugin 2>&1 | grep "completion notification"
```

### Sample Log Output
```
[execute-task] Sent completion notification to agent agent-597b5756-2915-4560-ba6b-91005f085166 for task task-1761348209833-9945rtjcj
```

### Verify Agent Received Message
```bash
curl -s "https://letta.oculair.ca/v1/agents/agent-597b5756-2915-4560-ba6b-91005f085166/messages?limit=1" \
  -H "Authorization: Bearer ${LETTA_PASSWORD}" | jq '.[0].content'
```

## Known Limitations

1. **Output truncation**: Only first 1000 chars in notification
   - **Solution**: Use `get_task_history` tool for full output
   
2. **Message role**: Sent as `user` not `system`
   - Letta API only accepts `user` or `assistant` roles
   - Appears as if user sent the message (minor UX quirk)
   
3. **No retry**: If Letta API fails, notification is lost
   - Error is logged but not retried
   - Task still completes successfully

## Future Enhancements

1. **Streaming updates**: Send progress notifications during execution
2. **Custom formatting**: Allow agents to configure notification format
3. **Selective notifications**: Option to disable notifications for certain tasks
4. **Rich media**: Include file previews, images, or artifacts in notifications

---

**Status**: ✅ Fully implemented and deployed  
**Commit**: `fbd066a7c09e445b11983e2f2c4f6afb26aba2b9`  
**Ready**: Yes - Agents will now receive automatic notifications on task completion
