#!/usr/bin/env node

/**
 * Direct test of OpenCode execution and Matrix completion message delivery
 * This bypasses Letta completely to isolate the OpenCode → Matrix flow
 */

import { ExecutionManager } from '../dist/execution-manager.js';
import { OpenCodeClientManager } from '../dist/opencode-client-manager.js';
import { MatrixRoomManager } from '../dist/matrix-room-manager.js';
import { MatrixClient } from '../dist/matrix-client.js';
import { TaskRegistry } from '../dist/task-registry.js';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

console.log(`${BLUE}=== Direct OpenCode + Matrix Test ===${NC}`);
console.log(`Started at: ${new Date().toISOString()}\n`);

async function runTest() {
  const testId = `test-${Date.now()}`;
  const testFile = `direct_test_${Date.now()}.txt`;

  console.log(`${BLUE}Test Configuration:${NC}`);
  console.log(`  Task ID: ${testId}`);
  console.log(`  Test file: ${testFile}`);
  console.log(`  OpenCode server: ${process.env.OPENCODE_SERVER_URL}`);
  console.log(`  Matrix enabled: ${process.env.MATRIX_ENABLED}`);
  console.log('');

  // Initialize components
  console.log(`${BLUE}Step 1: Initializing components${NC}`);

  const taskRegistry = new TaskRegistry();
  const openCodeClient = new OpenCodeClientManager(process.env.OPENCODE_SERVER_URL!);
  const executionManager = new ExecutionManager(openCodeClient);

  let matrixRoom: MatrixRoomManager | null = null;
  let roomInfo: { roomId: string; taskId: string } | null = null;

  if (process.env.MATRIX_ENABLED === 'true') {
    const matrixClient = new MatrixClient({
      homeserverUrl: process.env.MATRIX_HOMESERVER_URL!,
      accessToken: process.env.MATRIX_ACCESS_TOKEN!,
      userId: process.env.MATRIX_USER_ID!,
    });

    await matrixClient.start();

    matrixRoom = new MatrixRoomManager(
      matrixClient,
      taskRegistry,
      process.env.MATRIX_DEFAULT_HUMAN_OBSERVERS?.split(',') || []
    );

    console.log(`${GREEN}✓${NC} Matrix client initialized`);
  } else {
    console.log(`${YELLOW}⚠${NC} Matrix disabled, skipping Matrix tests`);
  }

  console.log(`${GREEN}✓${NC} Components initialized\n`);

  // Create Matrix room
  if (matrixRoom) {
    console.log(`${BLUE}Step 2: Creating Matrix room${NC}`);
    roomInfo = await matrixRoom.createTaskRoom(
      testId,
      `Direct test: Create ${testFile}`,
      'agent-test-direct'
    );
    console.log(`${GREEN}✓${NC} Matrix room created: ${roomInfo.roomId}\n`);
  }

  // Execute task
  console.log(`${BLUE}Step 3: Executing OpenCode task${NC}`);

  const executionRequest = {
    taskId: testId,
    agentId: 'agent-test-direct',
    prompt: `Create a file named ${testFile} with the content: Direct test of OpenCode + Matrix at ${new Date().toISOString()}`,
    workspaceBlockId: 'block-test-direct',
    timeout: 300000, // 5 minutes
  };

  let eventCount = 0;
  let completeEventReceived = false;
  const events: string[] = [];

  console.log('Starting execution...');
  const result = await executionManager.execute(executionRequest, (event) => {
    eventCount++;
    events.push(`${event.type}: ${JSON.stringify(event.data).slice(0, 100)}`);
    console.log(`  Event ${eventCount}: ${event.type}`);

    if (event.type === 'complete') {
      completeEventReceived = true;
      console.log(`${GREEN}  ✓ COMPLETE event received${NC}`);
    }

    // Send progress to Matrix if enabled
    if (matrixRoom && roomInfo) {
      matrixRoom
        .sendTaskUpdate(roomInfo.roomId, testId, `Event: ${event.type}`, 'progress')
        .catch((err) => {
          console.error(`${RED}  ✗ Failed to send Matrix update: ${err.message}${NC}`);
        });
    }
  });

  console.log(`\n${BLUE}Execution completed${NC}`);
  console.log(`  Status: ${result.status}`);
  console.log(`  Duration: ${result.durationMs}ms`);
  console.log(`  Events received: ${eventCount}`);
  console.log(
    `  Complete event: ${completeEventReceived ? GREEN + '✓ YES' + NC : RED + '✗ NO' + NC}`
  );
  console.log('');

  // Send completion message to Matrix
  if (matrixRoom && roomInfo) {
    console.log(`${BLUE}Step 4: Sending completion message to Matrix${NC}`);

    const finalStatus =
      result.status === 'success'
        ? 'completed'
        : result.status === 'timeout'
          ? 'timeout'
          : 'failed';
    const emoji = finalStatus === 'completed' ? '✅' : finalStatus === 'timeout' ? '⏱️' : '❌';

    let summary = `${emoji} Task ${finalStatus}\n\n`;
    summary += `Duration: ${result.durationMs}ms\n`;
    summary += `Events: ${eventCount}\n`;

    if (result.output) {
      summary += `\nOutput:\n${result.output.slice(0, 500)}`;
    }

    try {
      await matrixRoom.closeTaskRoom(roomInfo.roomId, testId, summary);
      console.log(`${GREEN}✓${NC} Completion message sent to Matrix room\n`);
    } catch (error) {
      console.error(`${RED}✗${NC} Failed to send completion message: ${error}\n`);
    }
  }

  // Summary
  console.log(`${BLUE}=== Test Summary ===${NC}`);
  console.log('');

  const checks = [
    { name: 'OpenCode execution completed', pass: result.status !== 'error' },
    { name: 'Events received from OpenCode', pass: eventCount > 0 },
    { name: 'COMPLETE event received', pass: completeEventReceived },
    { name: 'Matrix room created', pass: roomInfo !== null },
    { name: 'Completion message sent', pass: matrixRoom !== null && roomInfo !== null },
  ];

  let passed = 0;
  checks.forEach((check) => {
    const status = check.pass ? `${GREEN}✓${NC}` : `${RED}✗${NC}`;
    console.log(`${status} ${check.name}`);
    if (check.pass) passed++;
  });

  console.log('');
  console.log(`Checks passed: ${passed}/${checks.length}`);
  console.log('');

  if (roomInfo) {
    console.log(`${BLUE}Matrix room for review:${NC}`);
    console.log(`  ${process.env.MATRIX_HOMESERVER_URL}/#/room/${roomInfo.roomId}`);
    console.log('');
  }

  console.log(`${BLUE}Event log:${NC}`);
  events.forEach((evt, idx) => {
    console.log(`  ${idx + 1}. ${evt}`);
  });

  process.exit(passed === checks.length ? 0 : 1);
}

// Load environment
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env') });

runTest().catch((error) => {
  console.error(`${RED}Test failed with error:${NC}`, error);
  process.exit(1);
});
