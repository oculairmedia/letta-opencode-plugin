# Test Coverage Roadmap

## Current Status

**Overall Coverage: 7.1%** (Target: 70%)

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Statements | 7.1% | 70% | 62.9% |
| Branches | 4.09% | 70% | 65.91% |
| Functions | 9.32% | 70% | 60.68% |
| Lines | 7.11% | 70% | 62.89% |

## Test Status

- **Total Tests**: 21
- **Passing**: 18 ✅
- **Failing**: 3 ❌ (integration tests)
- **New Tests Added**: 5 (with TypeScript errors to fix)

## Progress

### ✅ Completed

1. **OpenCode Client Manager Tests** - Basic session creation, health checks
2. **Execution Manager Tests** - Core execution logic
3. **Mock Infrastructure** - `@opencode-ai/sdk` mock for tests

### 🚧 In Progress

1. **MCP Tools Tests** - Created but need TypeScript fixes
   - `execute-task.test.ts` - Comprehensive execution tests
   - `task-status.test.ts` - Status retrieval tests (needs snake_case fixes)
   
2. **Infrastructure Tests** - Created but not yet running
   - `workspace-manager.test.ts` - Block operations, file management
   - `task-registry.test.ts` - Task lifecycle, concurrency
   - `letta-client.test.ts` - API client operations

### ❌ Not Started

1. **Matrix Integration** (0% coverage)
   - `matrix-client.test.ts`
   - `matrix-room-manager.test.ts`
   - `matrix-message-router.test.ts`

2. **HTTP Transport** (0% coverage)
   - `http-transport.test.ts`

3. **Control Signals** (0% coverage)
   - `control-signal-handler.test.ts`

4. **Remaining MCP Tools** (0% coverage)
   - `file-access-tools.test.ts`
   - `task-coordination-tools.test.ts`
   - `task-feedback-tools.test.ts`
   - `task-message-tools.test.ts`
   - `task-observer-tools.test.ts`
   - `task-archive-tools.test.ts`

## Issues to Fix

### High Priority

1. **3 Failing Integration Tests**
   ```
   - tests/integration/opencode-server.test.ts:80 - Timeout handling
   - tests/integration/opencode-server.test.ts:168 - Task cancellation
   - tests/integration/opencode-server.test.ts:194 - Task pause/resume
   ```

2. **TypeScript Errors in New Tests**
   ```
   - snake_case vs camelCase mismatch in API parameters
   - Type mismatches in mock return values
   - Missing required fields in test objects
   ```

3. **Mock Configuration**
   ```
   - Ensure all external dependencies properly mocked
   - Fix Jest ESM module resolution
   - Update type definitions for mocks
   ```

## Test Files Needed

### MCP Tools (`tests/unit/tools/`)

- [ ] `execute-task.test.ts` ✅ (needs fixes)
- [ ] `task-status.test.ts` ✅ (needs fixes)
- [ ] `file-access-tools.test.ts`
- [ ] `task-coordination-tools.test.ts`
- [ ] `task-feedback-tools.test.ts`
- [ ] `task-message-tools.test.ts`
- [ ] `task-observer-tools.test.ts`
- [ ] `task-archive-tools.test.ts`

### Infrastructure (`tests/unit/`)

- [ ] `workspace-manager.test.ts` ✅ (needs to run)
- [ ] `task-registry.test.ts` ✅ (needs to run)
- [ ] `letta-client.test.ts` ✅ (needs to run)
- [ ] `http-transport.test.ts`
- [ ] `control-signal-handler.test.ts`

### Matrix Integration (`tests/unit/matrix/`)

- [ ] `matrix-client.test.ts`
- [ ] `matrix-room-manager.test.ts`
- [ ] `matrix-message-router.test.ts`

### Integration (`tests/integration/`)

- [x] `opencode-server.test.ts` (exists, 3 failures)
- [ ] `end-to-end.test.ts`
- [ ] `matrix-integration.test.ts`

## Estimated Coverage Impact

### Phase 1: Fix Existing Tests (Est. +10%)

- Fix TypeScript errors in new test files
- Fix 3 failing integration tests
- **Expected Coverage**: ~17%

### Phase 2: Infrastructure Tests (Est. +20%)

- Complete workspace-manager tests
- Complete task-registry tests
- Complete letta-client tests
- **Expected Coverage**: ~37%

### Phase 3: MCP Tools Tests (Est. +25%)

- All 8 tool test suites
- **Expected Coverage**: ~62%

### Phase 4: Matrix & Transport (Est. +15%)

- Matrix integration tests
- HTTP transport tests
- Control signal handler tests
- **Expected Coverage**: ~77% ✅ (exceeds 70% target)

## Next Steps

1. **Immediate (High Priority)**
   - Fix snake_case vs camelCase in `task-status.test.ts`
   - Fix TypeScript errors in `execute-task.test.ts`
   - Ensure new test files are discovered by Jest
   - Run tests and verify they pass

2. **Short Term (This Week)**
   - Complete all MCP tool tests
   - Add Matrix integration tests
   - Fix 3 failing integration tests

3. **Medium Term (Next Sprint)**
   - HTTP transport tests
   - Control signal handler tests
   - End-to-end integration tests
   - Reach 70% coverage threshold

## Testing Strategy

### Unit Tests

**What to Test:**
- Individual function behavior
- Edge cases and error handling
- Parameter validation
- Return value correctness

**Mocking Strategy:**
- Mock all external dependencies
- Mock `@opencode-ai/sdk`
- Mock `matrix-bot-sdk`
- Mock Letta API responses

### Integration Tests

**What to Test:**
- Component interactions
- Real OpenCode server (when available)
- Real Matrix server (when available)
- End-to-end task execution

**Environment:**
- Skip tests when services unavailable
- Use `OPENCODE_SERVER_ENABLED` flag
- Use `MATRIX_ENABLED` flag

### Test Data

**Fixtures:**
- Sample agents
- Sample workspaces
- Sample tasks
- Sample Matrix messages

**Factories:**
- Task factory
- Agent factory
- Workspace factory

## Coverage Metrics by Module

### Target Coverage (70%)

| Module | Current | Target | Priority |
|--------|---------|--------|----------|
| **execution-manager.ts** | 37% | 70% | Medium |
| **opencode-client-manager.ts** | 15% | 70% | High |
| **letta-client.ts** | 0% | 70% | High |
| **workspace-manager.ts** | 0% | 70% | High |
| **task-registry.ts** | 0% | 70% | High |
| **control-signal-handler.ts** | 0% | 70% | Medium |
| **http-transport.ts** | 0% | 70% | Medium |
| **matrix-*.ts** | 0% | 70% | Low |
| **tools/*.ts** | 0% | 70% | High |

## Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific test file
npm test -- tests/unit/workspace-manager.test.ts
```

## CI/CD Integration

### Coverage Gates

- **Minimum Coverage**: 70%
- **Block PRs**: Yes, if coverage drops below threshold
- **Report Format**: lcov, text-summary
- **Upload**: Coverage reports to CI artifacts

### Test Matrix

- Node.js 18, 20
- With/without OpenCode server
- With/without Matrix server

## Documentation

- [Jest Configuration](../jest.config.js)
- [Test Setup](../tests/setup.ts)
- [Mock Utilities](../tests/__mocks__/)
- [Test Helpers](../tests/helpers/)

---

**Last Updated**: 2025-10-12  
**Status**: In Progress  
**Next Review**: After Phase 1 completion
