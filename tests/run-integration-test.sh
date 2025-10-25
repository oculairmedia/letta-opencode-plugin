#!/bin/bash

# Integration test that runs INSIDE the Docker container
# This exercises the full OpenCode → Matrix completion flow

set -e

echo "=== Integration Test: OpenCode + Matrix Completion ==="
echo "Running inside container at $(date)"
echo ""

# Test will be executed by docker exec
cat > /tmp/integration-test.mjs << 'TESTEOF'
import { ExecutionManager } from '/app/dist/execution-manager.js';
import { OpenCodeClientManager } from '/app/dist/opencode-client-manager.js';
import { MatrixRoomManager } from '/app/dist/matrix-room-manager.js';
import { MatrixClientWrapper } from '/app/dist/matrix-client.js';
import { TaskRegistry } from '/app/dist/task-registry.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

console.log(`${BOLD}${BLUE}>>> Starting Integration Test${NC}`);
console.log(`${BLUE}Time: ${new Date().toISOString()}${NC}\n`);

const testId = `integration-test-${Date.now()}`;
const testFile = `test_${Date.now()}.txt`;

console.log(`${BLUE}Configuration:${NC}`);
console.log(`  Task ID: ${testId}`);
console.log(`  Test file: ${testFile}`);
console.log(`  OpenCode URL: ${process.env.OPENCODE_SERVER_URL}`);
console.log(`  Matrix URL: ${process.env.MATRIX_HOMESERVER_URL}`);
console.log('');

async function runTest() {
  try {
    // Step 1: Initialize components
    console.log(`${BOLD}Step 1: Initialize Components${NC}`);

    const taskRegistry = new TaskRegistry();

    const executionConfig = {
      openCodeServerEnabled: process.env.OPENCODE_SERVER_ENABLED === 'true',
      openCodeServerUrl: process.env.OPENCODE_SERVER_URL,
      healthCheckIntervalMs: 5000,
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    const executionManager = new ExecutionManager(executionConfig);

    const matrixClient = new MatrixClientWrapper({
      homeserverUrl: process.env.MATRIX_HOMESERVER_URL,
      accessToken: process.env.MATRIX_ACCESS_TOKEN,
      userId: process.env.MATRIX_USER_ID,
    });

    await matrixClient.start();

    const matrixRoom = new MatrixRoomManager(matrixClient);

    console.log(`${GREEN}✓ All components initialized${NC}\n`);

    // Step 2: Create Matrix room
    console.log(`${BOLD}Step 2: Create Matrix Room${NC}`);
    const roomInfo = await matrixRoom.createTaskRoom({
      taskId: testId,
      taskDescription: `Integration test: ${testFile}`,
      callingAgentId: 'agent-integration-test',
      humanObservers: (process.env.MATRIX_DEFAULT_HUMAN_OBSERVERS || '').split(',').filter(Boolean)
    });
    console.log(`${GREEN}✓ Matrix room created: ${roomInfo.roomId}${NC}`);
    console.log(`${BLUE}  View at: ${process.env.MATRIX_HOMESERVER_URL}/#/room/${roomInfo.roomId}${NC}\n`);

    // Step 3: Execute OpenCode task
    console.log(`${BOLD}Step 3: Execute OpenCode Task${NC}`);
    console.log(`${BLUE}Task: Create file ${testFile} with timestamp${NC}\n`);

    const executionRequest = {
      taskId: testId,
      agentId: 'agent-integration-test',
      prompt: `Create a file named ${testFile} with the content: Integration test executed at ${new Date().toISOString()}`,
      workspaceBlockId: `block-${testId}`,
      timeout: 300000,
    };

    let eventCount = 0;
    let completeEventReceived = false;
    let finishEventSeen = false;
    const allEvents = [];

    console.log(`${BLUE}Executing... (watching for events)${NC}`);

    const result = await executionManager.execute(executionRequest, (event) => {
      eventCount++;
      allEvents.push(event.type);

      if (event.type === 'finish' || event.type === 'finish-step') {
        finishEventSeen = true;
      }

      if (event.type === 'complete') {
        completeEventReceived = true;
      }

      console.log(`  ${eventCount}. Event: ${YELLOW}${event.type}${NC}`);

      // Send to Matrix
      matrixRoom.sendTaskUpdate(
        roomInfo.roomId,
        testId,
        `Event ${eventCount}: ${event.type}`,
        'progress'
      ).catch(err => console.error(`${RED}Matrix update failed: ${err.message}${NC}`));
    });

    console.log('');
    console.log(`${BOLD}Execution Result:${NC}`);
    console.log(`  Status: ${result.status === 'success' ? GREEN : RED}${result.status}${NC}`);
    console.log(`  Duration: ${result.durationMs}ms`);
    console.log(`  Events received: ${eventCount}`);
    console.log(`  Output length: ${result.output?.length || 0} chars`);
    console.log('');

    // Step 4: Send completion message
    console.log(`${BOLD}Step 4: Send Completion Message to Matrix${NC}`);

    const finalStatus = result.status === 'success' ? 'completed' :
                       result.status === 'timeout' ? 'timeout' : 'failed';
    const emoji = finalStatus === 'completed' ? '✅' : finalStatus === 'timeout' ? '⏱️' : '❌';

    let summary = `${emoji} Task ${finalStatus}\\n\\n`;
    summary += `Duration: ${result.durationMs}ms\\n`;
    summary += `Events: ${eventCount}\\n`;
    summary += `Exit Code: ${result.exitCode}\\n`;

    if (result.output) {
      const preview = result.output.slice(0, 300);
      summary += `\\nOutput Preview:\\n${preview}${result.output.length > 300 ? '...' : ''}`;
    }

    await matrixRoom.closeTaskRoom(roomInfo.roomId, testId, summary);
    console.log(`${GREEN}✓ Completion message sent to Matrix${NC}\n`);

    // Results
    console.log(`${BOLD}${BLUE}=== TEST RESULTS ===${NC}\n`);

    const checks = [
      { name: 'OpenCode execution succeeded', pass: result.status === 'success', critical: true },
      { name: 'Events received from OpenCode', pass: eventCount > 0, critical: true },
      { name: 'Finish events seen (pre-mapping)', pass: finishEventSeen, critical: false },
      { name: 'COMPLETE event received (post-mapping)', pass: completeEventReceived, critical: true },
      { name: 'Matrix room created', pass: true, critical: true },
      { name: 'Completion message sent to Matrix', pass: true, critical: true },
    ];

    let passed = 0;
    let failed = 0;

    checks.forEach(check => {
      if (check.pass) {
        console.log(`${GREEN}✓${NC} ${check.name}`);
        passed++;
      } else {
        const marker = check.critical ? `${RED}✗ CRITICAL${NC}` : `${YELLOW}⚠ WARNING${NC}`;
        console.log(`${marker} ${check.name}`);
        if (check.critical) failed++;
      }
    });

    console.log('');
    console.log(`${BOLD}Summary: ${passed}/${checks.length} checks passed${NC}`);

    if (!completeEventReceived && finishEventSeen) {
      console.log(`${RED}${BOLD}>>> BUG CONFIRMED: finish events NOT mapped to complete!${NC}`);
    } else if (completeEventReceived) {
      console.log(`${GREEN}${BOLD}>>> SUCCESS: Event mapping working correctly!${NC}`);
    }

    console.log('');
    console.log(`${BLUE}Event sequence:${NC}`);
    allEvents.forEach((evt, idx) => {
      console.log(`  ${idx + 1}. ${evt}`);
    });

    console.log('');
    console.log(`${BLUE}Matrix room: ${process.env.MATRIX_HOMESERVER_URL}/#/room/${roomInfo.roomId}${NC}`);
    console.log('');

    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error(`${RED}${BOLD}TEST FAILED WITH ERROR:${NC}`);
    console.error(error);
    process.exit(1);
  }
}

runTest();
TESTEOF

echo "Test script created, copying to container..."

# Copy test script into container
docker cp /tmp/integration-test.mjs letta-opencode-plugin:/tmp/integration-test.mjs

echo "Executing test inside container..."
echo ""
echo "----------------------------------------"
echo ""

# Execute test inside container
docker exec letta-opencode-plugin node /tmp/integration-test.mjs

TEST_EXIT=$?

echo ""
echo "----------------------------------------"
echo ""

if [ $TEST_EXIT -eq 0 ]; then
    echo -e "\033[1;32m✓ INTEGRATION TEST PASSED\033[0m"
else
    echo -e "\033[1;31m✗ INTEGRATION TEST FAILED (exit code: $TEST_EXIT)\033[0m"
fi

echo ""
echo "Full container logs available via: docker compose logs letta-opencode-plugin"
echo ""

exit $TEST_EXIT
