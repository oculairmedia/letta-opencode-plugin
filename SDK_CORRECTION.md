# OpenCode SDK - Correction ✅

## I Was Wrong! 

You were absolutely right - we **SHOULD** be using `@opencode-ai/sdk`!

## What @opencode-ai/sdk Actually Is

**Purpose:** Type-safe TypeScript client for interacting with **OpenCode server** (`opencode serve`)

**Not for:** Cloud API calls (my initial mistake)  
**Actually for:** Local OpenCode server communication ✅

## The SDK Provides

### Client Functions

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096"
})

// Session management
await client.session.create({ body: { title: "Task" } })
await client.session.prompt({ path: { id }, body: { parts: [...] } })
await client.session.abort({ path: { id } })

// File operations
await client.file.read({ query: { path: "file.ts" } })
await client.file.status()

// Events
const events = await client.event.subscribe()
for await (const event of events.stream) {
  console.log(event)
}
```

## What We Fixed

### Before (Custom HTTP Calls)

```typescript
// Manual fetch calls
const response = await fetch(`${serverUrl}/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ... })
});
const data = await response.json();
```

### After (Using SDK) ✅

```typescript
// Type-safe SDK calls
const session = await this.client.session.create({
  body: { title: `Task: ${taskId}` }
});

await this.client.session.prompt({
  path: { id: session.id },
  body: { parts: [{ type: "text", text: prompt }] }
});
```

## Implementation Status

### ✅ Updated Files

1. **`src/opencode-client-manager.ts`**
   - Now uses `createOpencodeClient()` from SDK
   - Type-safe method calls
   - Proper error handling
   - Event subscription via SDK

2. **`package.json`**
   - Re-added `@opencode-ai/sdk@^0.15.0`
   - Dependency properly included

### SDK Methods We Use

| Operation | SDK Method | Purpose |
|-----------|------------|---------|
| Health check | Manual fetch | Check server availability |
| Create session | `client.session.create()` | Start new task session |
| Send prompt | `client.session.prompt()` | Send task description |
| Get session | `client.session.get()` | Get session status |
| Abort | `client.session.abort()` | Cancel running task |
| List files | `client.file.status()` | Get tracked files |
| Read file | `client.file.read()` | Read file content |
| Subscribe events | `client.event.subscribe()` | Real-time events |

## Why This Matters

### Type Safety ✅

```typescript
// SDK provides full TypeScript definitions
const session: Session = await client.session.create({ ... })
//     ^^^^^^^ - Type-safe!

// Compiler catches errors
await client.session.create({
  body: { 
    title: 123  // ❌ Error: Type 'number' is not assignable to type 'string'
  }
});
```

### API Compatibility ✅

- SDK matches OpenCode server API exactly
- Updates handled by SDK maintainers
- Breaking changes caught at compile time

### Better DX ✅

- Autocomplete in IDE
- Inline documentation
- Fewer bugs from typos

## OpenCode Server Mode

When we enable OpenCode server mode (`OPENCODE_SERVER_ENABLED=true`):

1. **Start OpenCode Server:**
   ```dockerfile
   CMD ["opencode", "serve", "--port", "3100"]
   ```

2. **Use SDK Client:**
   ```typescript
   const client = createOpencodeClient({
     baseUrl: "http://opencode-server:3100"
   });
   ```

3. **Type-safe Operations:**
   ```typescript
   // All operations through SDK
   await client.session.create({ ... });
   await client.session.prompt({ ... });
   await client.file.read({ ... });
   ```

## Current Status

### Docker Mode (Active)
- ✅ Using `opencode run` CLI directly
- ✅ Working and deployed

### Server Mode (Ready)
- ✅ SDK installed and integrated
- ✅ OpenCodeClientManager updated to use SDK
- ⏳ Waiting to enable `OPENCODE_SERVER_ENABLED=true`
- ⏳ Need to deploy `opencode serve` container

## Migration Path

### Step 1: Deploy OpenCode Server
```bash
# Update Dockerfile.opencode to run server
CMD ["opencode", "serve", "--port", "3100", "--host", "0.0.0.0"]

# Build and start
docker compose up -d opencode-server
```

### Step 2: Enable Server Mode
```bash
# .env
OPENCODE_SERVER_ENABLED=true
OPENCODE_SERVER_URL=http://opencode-server:3100
```

### Step 3: Restart Plugin
```bash
docker compose restart letta-opencode-plugin
```

### Step 4: Test
```bash
# Test with SDK-based execution
curl -X POST http://localhost:3500/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "opencode_execute_task",
      "arguments": {
        "agent_id": "test",
        "task_description": "List files",
        "sync": true
      }
    }
  }'
```

## Summary

**Before:** Custom HTTP client (manual fetch calls)  
**After:** Official SDK with type safety ✅

**Status:** 
- ✅ SDK installed
- ✅ Code refactored to use SDK
- ✅ Build successful
- ✅ Ready for OpenCode server mode

**You were right!** The SDK is exactly what we need for OpenCode server integration. 🎉

---

**Thank you for catching this!** The SDK makes our OpenCode server integration much more robust.

