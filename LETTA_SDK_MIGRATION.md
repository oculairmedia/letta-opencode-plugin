# Letta SDK Migration Recommendation

## Discovery: Official Letta SDK Exists! 🎉

**Package:** `@letta-ai/letta-client@0.0.68664`  
**Published:** September 29, 2025  
**Maintainers:** cpacker, 4shub, sarahwooders  
**Source:** https://www.npmjs.com/package/@letta-ai/letta-client

## Current Status

**We're using:** Custom HTTP client (`src/letta-client.ts`)  
**Should migrate to:** Official `@letta-ai/letta-client` SDK

## Why Migrate?

### Advantages ✅

1. **Official Support** - Maintained by Letta team
2. **Type Safety** - Official TypeScript definitions
3. **API Coverage** - All Letta endpoints supported
4. **Breaking Changes** - Handled by SDK updates
5. **Community** - Shared knowledge base
6. **Documentation** - Official docs and examples
7. **Bug Fixes** - Centralized issue tracking

### Disadvantages ⚠️

1. **Dependency** - Rely on SDK release cycle
2. **Bundle Size** - May be larger than custom client
3. **Migration Work** - Need to refactor existing code

## Migration Plan

### Phase 1: Install and Test (1 day)

```bash
npm install @letta-ai/letta-client
```

### Phase 2: Wrapper Pattern (1 day)

Keep existing `LettaClient` interface, delegate to SDK:

```typescript
import { Letta } from "@letta-ai/letta-client";

export class LettaClient {
  private sdk: Letta;
  
  constructor(config: LettaConfig) {
    this.sdk = new Letta({
      token: config.token,
      baseUrl: config.baseUrl
    });
  }
  
  // Wrap SDK methods with same interface
  async listAgents(): Promise<LettaAgent[]> {
    return this.sdk.agents.list();
  }
  
  async createMemoryBlock(
    agentId: string, 
    request: CreateMemoryBlockRequest
  ): Promise<LettaMemoryBlock> {
    return this.sdk.memoryBlocks.create(agentId, request);
  }
  
  // ... other methods
}
```

### Phase 3: Gradual Migration (2-3 days)

1. Migrate memory block operations
2. Migrate agent operations  
3. Migrate message operations
4. Test each endpoint
5. Remove custom HTTP code

### Phase 4: Testing (1 day)

- Unit tests
- Integration tests
- Verify all tools still work
- Check error handling

## Implementation Example

### Before (Custom Client)

```typescript
// src/letta-client.ts
export class LettaClient {
  private async fetchWithRetry<T>(path: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      ...options,
    });
    return response.json();
  }
  
  async createMemoryBlock(
    agentId: string,
    request: CreateMemoryBlockRequest
  ): Promise<LettaMemoryBlock> {
    return this.fetchWithRetry(`/v1/agents/${agentId}/memory/blocks`, {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
}
```

### After (Official SDK)

```typescript
// src/letta-client.ts
import { Letta } from "@letta-ai/letta-client";

export class LettaClient {
  private sdk: Letta;
  
  constructor(config: LettaConfig) {
    this.sdk = new Letta({
      token: config.token,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeout,
    });
  }
  
  async createMemoryBlock(
    agentId: string,
    request: CreateMemoryBlockRequest
  ): Promise<LettaMemoryBlock> {
    // SDK handles auth, retries, error handling
    return this.sdk.memoryBlocks.create(agentId, request);
  }
}
```

## Breaking Changes Risk

**Low Risk:** Our `LettaClient` abstraction protects consumers

```typescript
// Consumers use our interface (unchanged)
const letta = new LettaClient(config);
await letta.createMemoryBlock(agentId, request);

// Internal implementation changes (hidden from consumers)
// Before: Direct HTTP → After: SDK delegation
```

## Estimated Effort

| Phase | Effort | Risk |
|-------|--------|------|
| Install & Test | 2 hours | Low |
| Wrapper Pattern | 4 hours | Low |
| Migrate Operations | 1 day | Medium |
| Testing | 4 hours | Low |
| **Total** | **2 days** | **Low** |

## Decision Recommendation

### ✅ RECOMMENDED: Migrate to Official SDK

**Reasons:**
1. Official support and maintenance
2. Low migration risk (wrapper pattern)
3. Long-term benefits (updates, bug fixes)
4. Community knowledge sharing

**Timeline:** Schedule for next sprint (not urgent)

### Alternative: Keep Custom Client

**When to consider:**
- SDK missing critical features we need
- SDK has major bugs or issues
- Migration cost outweighs benefits

## Action Items

### Immediate (Research)
- [ ] Install `@letta-ai/letta-client` in test branch
- [ ] Review SDK documentation
- [ ] Test basic operations (list agents, create block)
- [ ] Verify all endpoints we use are supported

### Short-term (Implementation)
- [ ] Create wrapper implementation
- [ ] Migrate one operation (test pattern)
- [ ] Write migration tests
- [ ] Full migration if successful

### Long-term (Maintenance)
- [ ] Monitor SDK updates
- [ ] Update to latest versions
- [ ] Contribute issues/PRs if needed

## Current Custom Client Coverage

Our custom client implements:

- ✅ `listAgents()` - GET /v1/agents
- ✅ `getAgent(id)` - GET /v1/agents/{id}
- ✅ `createMemoryBlock()` - POST /v1/agents/{id}/memory/blocks
- ✅ `listMemoryBlocks()` - GET /v1/agents/{id}/memory/blocks
- ✅ `updateMemoryBlock()` - PUT /v1/agents/{id}/memory/blocks/{block_id}
- ✅ `attachMemoryBlock()` - POST /v1/agents/{id}/memory/attach
- ✅ `detachMemoryBlock()` - DELETE /v1/agents/{id}/memory/blocks/{block_id}
- ✅ `sendMessage()` - POST /v1/agents/{id}/messages

**Verify SDK supports all of these before migrating.**

## Summary

**Current:** Custom HTTP client (works well)  
**Available:** Official SDK (`@letta-ai/letta-client`)  
**Recommendation:** Migrate to official SDK  
**Priority:** Medium (not urgent, schedule for next sprint)  
**Effort:** ~2 days  
**Risk:** Low (wrapper pattern protects consumers)

---

**Next Steps:** Research and test SDK in development branch

