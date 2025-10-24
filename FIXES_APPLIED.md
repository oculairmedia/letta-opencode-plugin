# Letta OpenCode Plugin - Fixes Applied

**Date**: October 24, 2025  
**Latest Commit**: `8b83b43` - Fix OpenCode SDK API calls  
**Status**: ✅ DEPLOYED - Ready for Testing

## Critical Bugs Fixed

### 1. ✅ OpenCode SDK API Method Signatures (CRITICAL)
**Problem**: Using incorrect API format for `session.prompt()` and `sendMessage()`
- Code was calling: `client.session.prompt(sessionId, {...})`
- Correct format: `client.session.prompt({ path: { id: sessionId }, body: {...} })`

**Fix**: Updated all SDK method calls to match official OpenCode SDK documentation
- `session.prompt` now uses `{path: {id}, body: {model, parts}}` format
- `sendMessage` converted from raw fetch to SDK method
- Aligns with OpenCode SDK v0.15.0 specification

**Files Modified**:
- `src/opencode-client-manager.ts` (lines 92-99, 181-196)

**Impact**: OpenCode sessions will now **actually receive prompts** and execute tasks

---

### 2. ✅ MCP HTTP Response Timeout
**Problem**: Letta's HTTP client times out (~30s) before long-running OpenCode tasks complete
- Tool returns timeout error to Letta
- Task execution continues in background but Letta never gets result
- Causes `ExceptionGroup: unhandled errors in a TaskGroup` exceptions

**Fix**: Added 25-second timeout guard for sync mode
- If task doesn't complete within 25s, returns early with status `"running"`
- Provides clear message: "Task started but execution is taking longer than expected"
- Recommends using `get_task_status` tool to check progress
- Task continues executing in background

**Files Modified**:
- `src/tools/execute-task.ts` (lines 117-140)

**Impact**: No more HTTP timeout exceptions; Meridian can poll for task completion

---

### 3. ✅ Workspace Block Unique Constraint Violations
**Problem**: Multiple tasks created blocks with same label `opencode_workspace`
- Letta DB requires unique block labels per agent
- Caused 409 Conflict errors

**Fix**: Use unique labels per task: `opencode_workspace_{taskId}`

**Files Modified**:
- `src/workspace-manager.ts`

**Impact**: Multiple concurrent tasks work without conflicts

---

### 4. ✅ SDK Response Format Extraction
**Problem**: Session ID extraction was looking at wrong property
- OpenCode SDK returns `{data: {id: "ses_xxx"}, response: {}, request: {}}`
- Code was trying `response.id` directly

**Fix**: Extract from `response.data?.id || response.id` with fallback

**Files Modified**:
- `src/opencode-client-manager.ts` (line 64)

**Impact**: Session creation no longer fails silently

---

### 5. ✅ Error Propagation
**Problem**: Errors thrown in tools cause TaskGroup exceptions in Letta

**Fix**: Return error objects instead of throwing
```typescript
return { error: true, message: error.message, code: error.code };
```

**Files Modified**:
- `src/tools/execute-task.ts`

**Impact**: Graceful error handling without breaking Letta's executor

---

## Testing Results

### Unit Tests ✅
```bash
npm test
```
All tests passing, including:
- SDK response format validation
- Workspace block creation
- Error handling

### Integration Tests ✅
```bash
npm run test:integration
```
- OpenCode client manager verified
- Session creation tested
- Prompt sending validated

---

## Deployment Details

### Container Images
- **Image**: `ghcr.io/oculairmedia/letta-opencode-plugin:latest`
- **Git Commit**: `8b83b43fdacba7a1e983e50e741450132c1c335c`
- **Build**: Automated via GitHub Actions
- **Registry**: GitHub Container Registry

### Running Services
```bash
docker ps
NAME                    STATUS
letta-opencode-plugin   Up (healthy) - Port 3500
opencode-server         Up (healthy) - Port 3100
```

### MCP Integration
- **Server Name**: `opencode`
- **URL**: `http://192.168.50.90:3500/mcp`
- **Tools**: 9 tools available
- **Agent**: Meridian (`agent-597b5756-2915-4560-ba6b-91005f085166`)
- **Tool Attached**: `opencode_execute_task` ✅

---

## How to Test

### Test 1: Simple Task (Async Mode - Recommended)
```
@Meridian Use opencode_execute_task to create a simple hello.py file that prints "Hello, World!"
Do NOT use sync mode.
```

**Expected Behavior**:
1. ✅ Tool returns immediately with `task_id` and status `"queued"`
2. ✅ Workspace block created: `opencode_workspace_task-{id}`
3. ✅ OpenCode session created (format: `ses_XXXXXXXXX`)
4. ✅ **Prompt actually sent to session** (new fix!)
5. ✅ Task executes in background
6. Use `get_task_status` with the `task_id` to check completion

### Test 2: Check Task Status
```
@Meridian Use get_task_status to check on task {task_id}
```

**Expected**: Returns recent events and current status

### Test 3: Sync Mode (with timeout guard)
```
@Meridian Use opencode_execute_task with sync=true to create test.txt
```

**Expected**: 
- If completes < 25s: Returns success with results
- If takes > 25s: Returns early with status "running" and task ID for polling

---

## Known Limitations

1. **Sync mode timeout**: Maximum 25 seconds before auto-return
   - **Solution**: Use async mode + polling for long tasks
   
2. **No progress streaming**: Can't stream progress during execution
   - **Solution**: Use Matrix room integration (observers parameter)
   
3. **Session events**: Event subscription not yet tested end-to-end
   - **Next**: Validate event flow in production

---

## Previous Issues (Now Resolved)

### ❌ Old Error: HTTP Timeout
```
httpx.ReadTimeout
ExceptionGroup: unhandled errors in a TaskGroup
```
**Status**: ✅ Fixed with timeout guard

### ❌ Old Error: Wrong SDK API
```
OpenCode session created but no prompt received
```
**Status**: ✅ Fixed with correct `session.prompt()` format

### ❌ Old Error: Workspace Conflicts
```
409 Conflict: Block label 'opencode_workspace' already exists
```
**Status**: ✅ Fixed with unique labels per task

---

## Next Steps

1. **Test with Meridian** - Have Meridian execute a real task
2. **Monitor logs**: 
   ```bash
   docker logs -f letta-opencode-plugin
   docker logs -f opencode-server
   ```
3. **Verify Matrix integration** - Check Matrix rooms are created
4. **Test status polling** - Verify `get_task_status` works correctly
5. **Validate workspace updates** - Check Letta blocks contain task events

---

## Rollback Plan

If issues occur:
```bash
cd /opt/stacks/letta-opencode-plugin
git checkout 5592c53  # Previous working version
docker compose build
docker compose up -d
```

---

## References

- **Repository**: https://github.com/oculairmedia/letta-opencode-plugin
- **OpenCode SDK Docs**: https://docs.opencode.ai/sdk (used for API fixes)
- **Letta API**: https://letta.oculair.ca
- **Matrix Room**: Task rooms auto-created in Matrix for observation

---

**Status**: ✅ All critical bugs fixed and deployed
**Confidence**: High - Aligns with official OpenCode SDK documentation
**Ready**: Yes - Meridian can now test the tool
