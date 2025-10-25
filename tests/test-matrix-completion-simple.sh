#!/bin/bash

# Simplified test that uses Letta API to trigger OpenCode task
# This tests the Matrix completion message delivery issue

set -e

# Load environment
source /opt/stacks/letta-opencode-plugin/.env

echo "=== Matrix Completion Message Test (via Letta API) ==="
echo "Started at: $(date)"
echo ""

# Configuration
AGENT_ID="agent-597b5756-2915-4560-ba6b-91005f085166"
TEST_FILE="matrix_test_$(date +%s).txt"
TEST_CONTENT="Testing Matrix completion at $(date)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Start log capture in background
LOG_FILE="/tmp/matrix_completion_test_$(date +%s).log"
echo "Capturing logs to: $LOG_FILE"
docker compose logs -f --tail=0 letta-opencode-plugin > "$LOG_FILE" 2>&1 &
LOG_PID=$!
sleep 2

# Send message to Letta agent to trigger OpenCode task
echo ""
echo "Sending task to Letta agent..."
echo "Task: Create file $TEST_FILE"

RESPONSE=$(curl -s -X POST "${LETTA_API_URL}/agents/${AGENT_ID}/messages" \
  -H "Authorization: Bearer ${LETTA_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"messages\": [{
      \"role\": \"user\",
      \"content\": \"Using the opencode_execute_task tool, create a file named $TEST_FILE with the content: $TEST_CONTENT. Use sync=false.\"
    }]
  }")

echo "Response received"

# Extract task ID from response if possible
TASK_ID=$(echo "$RESPONSE" | jq -r '.. | select(.task_id?) | .task_id' 2>/dev/null | head -1)

if [ -n "$TASK_ID" ]; then
    echo -e "${GREEN}Task ID: $TASK_ID${NC}"
else
    echo -e "${YELLOW}Could not extract task ID${NC}"
fi

# Wait for task to complete
echo ""
echo "Waiting 40 seconds for task execution..."
for i in {40..1}; do
    echo -ne "\rTime remaining: $i seconds "
    sleep 1
done
echo ""

# Stop log capture
kill $LOG_PID 2>/dev/null || true
sleep 1

# Analyze logs
echo ""
echo "=== Log Analysis ==="
echo ""

check_log() {
    local pattern="$1"
    local description="$2"
    if grep -q "$pattern" "$LOG_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $description"
        return 0
    else
        echo -e "${RED}✗${NC} $description"
        return 1
    fi
}

SUCCESS=0
TOTAL=0

((TOTAL++))
check_log "\[execute-task\] Starting task" "Task execution started" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[execute-task\] Created workspace block" "Workspace block created" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[matrix-room-manager\] Creating task room" "Matrix room created" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[execution-manager\] Starting completion wait" "Completion wait started" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[OpenCodeClient\] Raw event received" "OpenCode events received" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[OpenCodeClient\] Mapping.*-> complete" "Event type mapping (finish->complete)" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[execution-manager\] COMPLETE event received" "COMPLETE event received by handler" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[execution-manager\].*completed, resolving promise" "Completion promise resolved" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[execute-task\].*completed with status" "Task status finalized" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[execute-task\] Checking Matrix room" "Matrix room check performed" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[execute-task\] Sending completion message to Matrix" "Completion message sending initiated" && ((SUCCESS++)) || true

((TOTAL++))
check_log "\[matrix-room-manager\] Closing task room" "Matrix room close method called" && ((SUCCESS++)) || true

echo ""
echo "=== Detailed Event Flow ==="
echo ""
echo "OpenCode raw events:"
grep "\[OpenCodeClient\] Raw event received" "$LOG_FILE" 2>/dev/null || echo "None found"

echo ""
echo "Event mappings:"
grep "\[OpenCodeClient\] Mapping" "$LOG_FILE" 2>/dev/null || echo "None found"

echo ""
echo "Execution manager events:"
grep "\[execution-manager\] Event received" "$LOG_FILE" 2>/dev/null || echo "None found"

echo ""
echo "=== Summary ==="
echo "Checks passed: $SUCCESS / $TOTAL"
echo "Log file: $LOG_FILE"
echo ""

if [ $SUCCESS -eq $TOTAL ]; then
    echo -e "${GREEN}✓ TEST PASSED${NC}: Matrix completion message delivery working"
    exit 0
elif [ $SUCCESS -ge 9 ]; then
    echo -e "${YELLOW}⚠ TEST PARTIAL${NC}: Most checks passed, review details"
    echo ""
    echo "Showing last 50 lines of log:"
    tail -50 "$LOG_FILE"
    exit 1
else
    echo -e "${RED}✗ TEST FAILED${NC}: Matrix completion message not delivered"
    echo ""
    echo "Critical missing steps:"
    grep -q "\[execution-manager\] COMPLETE event received" "$LOG_FILE" || echo "- COMPLETE event never received"
    grep -q "\[execute-task\].*completed with status" "$LOG_FILE" || echo "- Task never marked as completed"
    grep -q "\[execute-task\] Sending completion message to Matrix" "$LOG_FILE" || echo "- Matrix message never sent"
    echo ""
    echo "Showing full log:"
    cat "$LOG_FILE"
    exit 1
fi
