#!/bin/bash

# Test script to verify Matrix completion message delivery
# This script triggers an OpenCode task and monitors logs to verify completion

set -e

echo "=== Matrix Completion Message Test ==="
echo "Started at: $(date)"
echo ""

# Configuration
AGENT_ID="agent-597b5756-2915-4560-ba6b-91005f085166"
MCP_URL="http://localhost:3500/mcp"
TEST_FILE="matrix_completion_test_$(date +%s).txt"
TEST_CONTENT="Testing Matrix completion message delivery at $(date)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check logs for a pattern
check_logs() {
    local pattern="$1"
    local context="$2"
    echo -n "Checking for: $context... "
    if docker compose logs --tail=500 letta-opencode-plugin 2>&1 | grep -q "$pattern"; then
        echo -e "${GREEN}FOUND${NC}"
        return 0
    else
        echo -e "${RED}NOT FOUND${NC}"
        return 1
    fi
}

# Start log capture
echo "Starting log capture..."
LOG_FILE="/tmp/matrix_test_$(date +%s).log"
docker compose logs -f letta-opencode-plugin > "$LOG_FILE" 2>&1 &
LOG_PID=$!
echo "Log capture PID: $LOG_PID"
sleep 2

# Trigger task via direct HTTP call to MCP server
echo ""
echo "Triggering OpenCode task..."
echo "Task: Create file $TEST_FILE"
echo ""

# Initialize MCP session
echo "1. Initializing MCP session..."
INIT_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-protocol-version: 2025-06-18" \
  -H "x-agent-id: $AGENT_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test-client", "version": "1.0"}
    }
  }')

echo "Init response received"

# Extract session ID from SSE response
# The session ID is actually in the event ID header, not the result
SESSION_ID=$(echo "$INIT_RESPONSE" | grep "^id:" | head -1 | sed 's/^id: //' | cut -d'_' -f1)

if [ -z "$SESSION_ID" ]; then
    echo -e "${RED}Failed to get session ID${NC}"
    echo "Response: $INIT_RESPONSE"
    kill $LOG_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}Session ID: $SESSION_ID${NC}"

# Call the execute task tool
echo ""
echo "2. Calling opencode_execute_task..."
TASK_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-protocol-version: 2025-06-18" \
  -H "mcp-session-id: $SESSION_ID" \
  -H "x-agent-id: $AGENT_ID" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 2,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"opencode_execute_task\",
      \"arguments\": {
        \"agent_id\": \"$AGENT_ID\",
        \"task_description\": \"Create a file named $TEST_FILE with the content: $TEST_CONTENT\",
        \"sync\": false
      }
    }
  }")

echo "Task response received"

# Extract task ID from response
TASK_ID=$(echo "$TASK_RESPONSE" | grep "^data:" | sed 's/^data: //' | jq -r '.result.content[0].text' | grep -o 'task-[a-z0-9-]*' | head -1)

if [ -z "$TASK_ID" ]; then
    echo -e "${YELLOW}Could not extract task ID from response${NC}"
    echo "Response: $TASK_RESPONSE"
else
    echo -e "${GREEN}Task ID: $TASK_ID${NC}"
fi

# Wait for task to execute
echo ""
echo "3. Waiting for task execution (30 seconds)..."
sleep 30

# Stop log capture
echo ""
echo "4. Stopping log capture..."
kill $LOG_PID 2>/dev/null || true

# Analyze logs
echo ""
echo "=== Log Analysis ==="
echo ""

# Check for key log entries
CHECKS=(
    "[execute-task] Starting task:Task started"
    "[execute-task] Created workspace block:Workspace block created"
    "[matrix-room-manager] Creating task room:Matrix room created"
    "[execution-manager] Starting completion wait:Completion wait started"
    "[OpenCodeClient] Raw event received:OpenCode events received"
    "[OpenCodeClient] Mapping.*-> complete:Event mapping (finish -> complete)"
    "[execution-manager] COMPLETE event received:Complete event received"
    "[execution-manager] Task.*completed, resolving promise:Promise resolved"
    "[execute-task] Task.*completed with status:Task completion detected"
    "[execute-task] Sending completion message to Matrix:Matrix completion message sent"
    "[matrix-room-manager] Closing task room:Matrix room closed"
)

SUCCESS_COUNT=0
TOTAL_CHECKS=${#CHECKS[@]}

for check in "${CHECKS[@]}"; do
    IFS=':' read -r pattern description <<< "$check"
    if grep -q "$pattern" "$LOG_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $description"
        ((SUCCESS_COUNT++))
    else
        echo -e "${RED}✗${NC} $description"
    fi
done

echo ""
echo "=== Summary ==="
echo "Checks passed: $SUCCESS_COUNT / $TOTAL_CHECKS"
echo "Log file saved: $LOG_FILE"

if [ $SUCCESS_COUNT -eq $TOTAL_CHECKS ]; then
    echo -e "${GREEN}TEST PASSED: All checks successful${NC}"
    exit 0
elif [ $SUCCESS_COUNT -ge 5 ]; then
    echo -e "${YELLOW}TEST PARTIAL: Some checks failed${NC}"
    exit 1
else
    echo -e "${RED}TEST FAILED: Most checks failed${NC}"
    exit 1
fi
