# Matrix-Based Multi-Agent Coordination Architecture

## Overview

This design document describes the integration of Matrix (Synapse) as a communication layer for coordinating between Letta agents and OpenCode development agents, enabling true bidirectional communication, human-in-the-loop capabilities, and conversation archiving.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Matrix Synapse Server                           │
│                      (matrix.oculair.ca:8008)                          │
└────────────────┬────────────────────────────────────┬──────────────────┘
                 │                                    │
                 │                                    │
    ┌────────────▼────────────┐         ┌───────────▼────────────┐
    │   Letta Calling Agent   │         │  OpenCode Dev Agent    │
    │  (Primary Orchestrator) │         │ (Task Executor)        │
    │                         │         │                        │
    │  • Initiates tasks      │         │  • Executes code       │
    │  • Reviews progress     │         │  • Reports status      │
    │  • Provides feedback    │         │  • Requests guidance   │
    └────────────┬────────────┘         └───────────┬────────────┘
                 │                                    │
                 │                                    │
                 └────────────┬───────────────────────┘
                              │
                ┌─────────────▼──────────────┐
                │   Human Observer/Guide     │
                │  (Optional Participant)    │
                │                            │
                │  • Reviews conversations   │
                │  • Provides corrections    │
                │  • Offers expertise        │
                └────────────────────────────┘
```

## Core Components

### 1. Matrix Room Manager

**Location**: `src/matrix-room-manager.ts`

**Responsibilities**:
- Create dedicated Matrix room per OpenCode task
- Invite relevant participants (calling agent, dev agent, optional human)
- Set room permissions and metadata
- Archive room for later review

**API**:
```typescript
interface MatrixRoomManager {
  createTaskRoom(taskId: string, agentIds: string[], humanUserIds?: string[]): Promise<RoomInfo>;
  closeTaskRoom(roomId: string): Promise<void>;
  archiveTaskRoom(roomId: string): Promise<ArchiveInfo>;
}

interface RoomInfo {
  roomId: string;
  roomAlias: string;
  taskId: string;
  participants: Participant[];
  createdAt: number;
}
```

### 2. Matrix Message Router

**Location**: `src/matrix-message-router.ts`

**Responsibilities**:
- Route messages from Matrix room to appropriate OpenCode instance
- Route messages from OpenCode to Matrix room
- Route messages from Letta agent to Matrix room
- Handle message formatting and threading

**Message Flow**:
```
Letta Agent → Matrix Room → OpenCode Dev Agent
    ↑                              ↓
    └────────── Matrix Room ←──────┘
                    ↓
              Human Observer
```

### 3. Bidirectional Communication Layer

**Location**: `src/communication-layer.ts`

**Responsibilities**:
- Task cancellation signals
- Task pause/resume control
- Runtime updates (context injection)
- Feedback loop (iterative corrections)

**API**:
```typescript
interface CommunicationLayer {
  // Agent → OpenCode
  cancelTask(taskId: string, reason: string): Promise<void>;
  pauseTask(taskId: string): Promise<void>;
  resumeTask(taskId: string): Promise<void>;
  sendRuntimeUpdate(taskId: string, context: string): Promise<void>;
  sendFeedback(taskId: string, feedback: Feedback): Promise<void>;
  
  // OpenCode → Agent
  requestGuidance(taskId: string, question: string): Promise<string>;
  reportProgress(taskId: string, progress: Progress): Promise<void>;
  requestReview(taskId: string, artifact: Artifact): Promise<Review>;
}
```

## Detailed Design

### Task Lifecycle with Matrix

```
1. TASK CREATION
   ┌─────────────────────────────────────────────┐
   │ Letta Agent calls opencode_execute_task     │
   └──────────────────┬──────────────────────────┘
                      │
   ┌──────────────────▼──────────────────────────┐
   │ OpenCode Plugin creates Matrix room         │
   │  - Room name: "Task: ${taskId}"            │
   │  - Invite: calling agent + dev agent        │
   │  - Topic: task description                  │
   └──────────────────┬──────────────────────────┘
                      │
   ┌──────────────────▼──────────────────────────┐
   │ Dev Agent joins and posts initial message   │
   │  "🚀 Starting task execution..."           │
   └──────────────────┬──────────────────────────┘

2. EXECUTION WITH UPDATES
   ┌──────────────────▼──────────────────────────┐
   │ Dev Agent posts progress updates to room    │
   │  "✅ Created component structure"           │
   │  "🔧 Installing dependencies..."            │
   │  "📝 Writing tests..."                      │
   └──────────────────┬──────────────────────────┘
                      │
   ┌──────────────────▼──────────────────────────┐
   │ Calling Agent monitors and can respond      │
   │  "❗ Use TypeScript instead of JavaScript"  │
   └──────────────────┬──────────────────────────┘
                      │
   ┌──────────────────▼──────────────────────────┐
   │ Dev Agent receives update and adjusts       │
   │  "✅ Switching to TypeScript..."            │
   └──────────────────┬──────────────────────────┘

3. COMPLETION
   ┌──────────────────▼──────────────────────────┐
   │ Dev Agent posts completion message          │
   │  "✅ Task completed successfully"           │
   │  Artifacts: [link to files]                 │
   └──────────────────┬──────────────────────────┘
                      │
   ┌──────────────────▼──────────────────────────┐
   │ Room archived for future review             │
   └─────────────────────────────────────────────┘
```

### Message Types

**1. Status Updates** (Dev Agent → Room)
```json
{
  "msgtype": "m.text",
  "body": "✅ Completed step 1/5: Component structure created",
  "format": "org.matrix.custom.html",
  "formatted_body": "<strong>✅ Completed step 1/5:</strong> Component structure created",
  "io.letta.task": {
    "task_id": "task-123",
    "event_type": "progress",
    "progress_percent": 20
  }
}
```

**2. Guidance Requests** (Dev Agent → Room)
```json
{
  "msgtype": "m.text",
  "body": "❓ Should I use Redux or Context API for state management?",
  "io.letta.task": {
    "task_id": "task-123",
    "event_type": "guidance_request",
    "awaiting_response": true
  }
}
```

**3. Runtime Updates** (Calling Agent → Room → Dev Agent)
```json
{
  "msgtype": "m.text",
  "body": "📝 Update: Use shadcn/ui components instead of Material-UI",
  "io.letta.task": {
    "task_id": "task-123",
    "event_type": "runtime_update",
    "update_type": "requirement_change"
  }
}
```

**4. Control Signals** (Calling Agent → Dev Agent)
```json
{
  "msgtype": "io.letta.control",
  "io.letta.task": {
    "task_id": "task-123",
    "control": "pause|resume|cancel",
    "reason": "Waiting for design approval"
  }
}
```

### Human Participation

**Invitation Flow**:
```typescript
// When creating task room
if (userRequestsHumanReview) {
  await matrixClient.inviteUser(humanUserId, roomId);
  await matrixClient.sendText(roomId, 
    `👤 Human expert @${humanUserId} has been invited to observe and guide.`
  );
}
```

**Human Actions**:
- **Read-only observation**: Monitor progress without interrupting
- **Guidance**: Provide technical direction or corrections
- **Emergency intervention**: Cancel or redirect task execution
- **Approval**: Review and approve artifacts before completion

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

1. **Matrix Client Setup**
   - Create MatrixClient wrapper in letta-opencode-plugin
   - Configure authentication with Synapse server
   - Test room creation and messaging

2. **Room Management**
   - Implement MatrixRoomManager
   - Room creation with task metadata
   - Participant invitation system

3. **Basic Message Routing**
   - OpenCode → Matrix (status updates)
   - Matrix → OpenCode (control signals)

### Phase 2: Bidirectional Communication (Week 2)

1. **Task Control Signals**
   - Cancel task implementation
   - Pause/resume implementation
   - Signal propagation through Matrix

2. **Runtime Updates**
   - Context injection mechanism
   - Update workspace blocks with new info
   - Notify running OpenCode instance

3. **Feedback Loop**
   - Artifact review requests
   - Correction handling
   - Iterative improvement cycle

### Phase 3: Advanced Features (Week 3)

1. **Human Integration**
   - Optional human invitation
   - Permission management
   - Human response handling

2. **Conversation Archiving**
   - Room archival system
   - Search and retrieval
   - Replay capability

3. **Analytics**
   - Task success metrics
   - Interaction patterns
   - Performance tracking

## Configuration

**Environment Variables**:
```bash
# Matrix Configuration
MATRIX_HOMESERVER_URL=http://matrix.oculair.ca:8008
MATRIX_BOT_ACCESS_TOKEN=syt_...
MATRIX_BOT_USER_ID=@opencode-bot:matrix.oculair.ca

# Room Settings
MATRIX_ROOM_PREFIX=opencode-task
MATRIX_ARCHIVE_ENABLED=true
MATRIX_DEFAULT_ROOM_VERSION=10

# Human Integration
MATRIX_ALLOW_HUMAN_OBSERVERS=true
MATRIX_DEFAULT_HUMAN_USERS=@admin:matrix.oculair.ca
```

## Security Considerations

1. **Room Permissions**
   - Encrypted rooms for sensitive tasks
   - Read-only mode for observers
   - Admin controls for emergency intervention

2. **Message Validation**
   - Verify sender identity
   - Validate control signals
   - Rate limiting on commands

3. **Archive Access**
   - Role-based access control
   - Audit logging
   - Retention policies

## Benefits

### 1. **Full Bidirectional Communication**
- Calling agent can provide real-time guidance
- Dev agent can ask clarifying questions
- True collaborative development

### 2. **Human-in-the-Loop**
- Expert oversight when needed
- Emergency intervention capability
- Knowledge transfer to AI

### 3. **Transparency & Auditability**
- Complete conversation history
- Searchable archives
- Learning from past interactions

### 4. **Scalability**
- Multiple concurrent tasks
- Parallel agent conversations
- Federation support (future)

### 5. **Tool Integration**
- Matrix widgets for visualization
- File sharing for artifacts
- Rich media support

## Future Enhancements

1. **Multi-Agent Collaboration**
   - Multiple dev agents on one task
   - Specialist agents (frontend, backend, DevOps)
   - Agent voting on solutions

2. **Learning System**
   - Analyze successful patterns
   - Improve agent behaviors
   - Reduce human intervention over time

3. **Advanced Routing**
   - Intelligent message prioritization
   - Context-aware routing
   - Smart agent selection

4. **Federation**
   - Cross-organization collaboration
   - External expert consultation
   - Distributed development teams

## Metrics

Track effectiveness:
- Average messages per task
- Human intervention rate
- Task completion success rate
- Time to resolution
- Agent self-correction rate

## Conclusion

Matrix provides a robust, open-source foundation for multi-agent coordination. By using Matrix rooms as coordination spaces, we achieve:

✅ True bidirectional communication
✅ Human oversight and guidance  
✅ Complete conversation history
✅ Flexible, extensible architecture
✅ Industry-standard protocols

This design transforms OpenCode from a simple task executor into a collaborative development partner with full transparency and human-in-the-loop capabilities.
