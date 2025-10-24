# Changelog

All notable changes to the Letta OpenCode Plugin project.

## [0.2.0] - 2025-10-20

### Added
- OpenCode SDK Integration
  - Implemented OpenCode Client Manager using official `@opencode-ai/sdk` v0.15.0
  - Session creation and management via OpenCode server
  - Event subscription and monitoring
  - File operations (list, read) for task artifacts

- Host Configuration Mounting
  - Docker volumes for OpenCode config (`/root/.config/opencode`)
  - Docker volumes for OpenCode auth (`/root/.local/share/opencode`)
  - Docker volumes for OpenCode cache (`/root/.cache/opencode`)
  - Proper read-only vs read-write permissions for each mount

- Model Configuration
  - Configured to use Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
  - Anthropic provider integration via host credentials
  - No duplicate API keys required

- Agent-to-Agent Communication
  - Enhanced prompts instruct OpenCode agents to communicate back
  - OpenCode agents use Letta MCP tools to report completion
  - Bidirectional agent communication pattern
  - Task ID and calling agent ID provided in prompts

- Documentation
  - Comprehensive OPENCODE_INTEGRATION.md guide
  - Architecture diagrams and flow descriptions
  - Troubleshooting section
  - Updated README.md with OpenCode integration section

### Changed
- OpenCode server now uses host system credentials
- Task completion notifications handled by OpenCode agent (not plugin)
- Execution Manager updated to support OpenCode SDK integration

### Technical Details
- OpenCode SDK: `@opencode-ai/sdk` v0.15.0
- Host OpenCode: v0.15.8
- Model: Claude Sonnet 4.5 (Anthropic)
- Communication: Agent-to-agent via MCP tools
- Authentication: Host system credentials mounted to container

## [0.1.0] - 2025-10-12

### Added
- HTTP Transport implementation with StreamableHTTPServerTransport
  - Session-based transport with UUID generation
  - InMemoryEventStore for session recovery
  - Origin validation and DNS rebinding protection
  - CORS support for allowed origins
  - Protocol version validation (2025-06-18, 2025-03-26)
  
- Docker deployment support
  - Multi-stage Dockerfile with production optimizations
  - Dockge-compatible docker-compose.yml
  - Health checks via curl to /health endpoint
  - Docker socket mount for container execution
  - Non-root user (letta) for security
  - Resource limits and environment configuration
  
- Documentation
  - README.docker.md with comprehensive deployment guide
  - Updated README.md with HTTP transport usage
  - Updated ARCHITECTURE.md with HTTP transport details
  
### Changed
- Replaced StdioServerTransport with StreamableHTTPServerTransport
- Server now runs as HTTP service on configurable port (default: 3500)
- Main server.ts updated to use runHTTP() instead of stdio transport

### Dependencies
- Added: express ^4.18.2
- Added: cors ^2.8.5
- Added: @types/express ^4.17.21
- Added: @types/cors ^2.8.17

### Technical Details
- MCP Protocol Version: 2025-06-18
- Default Port: 3500
- Transport: Streamable HTTP with SSE support
- Session Management: In-memory with UUID tracking
- Security: Origin validation, CORS, DNS rebinding protection

## [0.0.1] - 2025-10-11

### Initial Implementation (MVP - LETTA-8)
- MCP Server with stdio transport
- Letta Client adapter with retry logic
- Execution Manager for Docker orchestration
- Task Registry with idempotency tracking
- Workspace Memory Blocks for bidirectional communication
- Tools: ping, health, opencode_execute_task
