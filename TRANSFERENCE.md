# Transference: Letta-OpenCode Integration Pattern

## Overview

**Transference** describes the cognitive handoff pattern between Letta agents and OpenCode execution sessions. It enables Letta agents to delegate concrete development tasks while maintaining their own persistent memory and planning capabilities.

## The Pattern

```
┌─────────────────┐                    ┌─────────────────┐
│   Letta Agent   │                    │    OpenCode     │
│                 │                    │                 │
│  • Memory       │    Transference    │  • Execution    │
│  • Planning     │ ──────────────────>│  • Tools        │
│  • Context      │                    │  • File I/O     │
│  • Goals        │ <──────────────────│  • Git          │
│                 │    Results/State   │                 │
└─────────────────┘                    └─────────────────┘
```

## Key Concepts

### 1. Cognitive Boundaries

- **Letta** owns: Long-term memory, planning, goal-setting, context accumulation
- **OpenCode** owns: Tool execution, file operations, shell commands, code generation

### 2. Workspace Memory Blocks

The bridge between systems. When a task is transferred:

1. Letta creates a workspace memory block with task context
2. OpenCode reads this block during execution
3. OpenCode writes results/events back to the block
4. Letta reads the updated block to understand outcomes

### 3. Ephemeral vs Persistent

| Aspect | Letta | OpenCode |
|--------|-------|----------|
| Session | Persistent | Ephemeral |
| Memory | Durable (archival) | Session-scoped |
| Context | Grows over time | Fresh each task |
| Identity | Continuous | Task-specific |

## Implementation

### MCP Tools

The `letta-opencode-plugin` exposes these MCP tools:

- **`opencode_execute_task`** - Primary transference mechanism
- **`opencode_get_task_status`** - Check execution progress
- **`opencode_cancel_task`** - Abort running task
- **`opencode_get_workspace_events`** - Read execution log

### Task Flow

```typescript
// 1. Letta agent decides to delegate
const task = await opencode_execute_task({
  agent_id: "agent-uuid",
  task_description: "Fix the login bug in auth.ts",
  sync: false  // Don't block
});

// 2. Poll for completion
while (task.status !== "completed") {
  await sleep(5000);
  task = await opencode_get_task_status({ task_id: task.task_id });
}

// 3. Process results
const events = await opencode_get_workspace_events({
  task_id: task.task_id
});
```

## Benefits

1. **Separation of Concerns** - Letta focuses on "what" and "why", OpenCode handles "how"
2. **Resource Isolation** - OpenCode runs in sandboxed Docker containers
3. **Failure Recovery** - If OpenCode fails, Letta retains full context to retry
4. **Scalability** - Multiple OpenCode instances can serve one Letta agent

## Anti-Patterns

### Don't: Use OpenCode for Planning
OpenCode should execute, not decide. Keep planning in Letta.

### Don't: Bypass Memory Blocks
Always use workspace blocks for communication. Direct API calls break the pattern.

### Don't: Long-Running Sessions
OpenCode sessions should be task-scoped. For ongoing work, use multiple short tasks.

## Configuration

Add to `.opencode/config.json`:

```json
{
  "mcp": {
    "letta-opencode-plugin": {
      "type": "remote",
      "url": "http://localhost:3500/mcp",
      "enabled": true
    }
  }
}
```

## Related

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [OPENCODE_INTEGRATION.md](./OPENCODE_INTEGRATION.md) - Setup guide
- [MATRIX_COORDINATION_DESIGN.md](./MATRIX_COORDINATION_DESIGN.md) - Human observer pattern
