# OpenCode Integration Learnings

This note captures ideas gathered while reviewing other OpenCode-focused projects. It is a holding place for potential improvements to the Letta OpenCode plugin and related tooling.

## From `remorses/kimaki`

- **Discord-first orchestration:** Kimaki keeps a long-running CLI daemon that maps Discord channels to OpenCode work directories. A similar CLI wrapper could complement our Matrix integration in environments where Matrix is unavailable or a lightweight chat control plane is preferred.
- **Persistent bot state:** The project stores state in a local SQLite database so the bot can resume after restarts. We can explore persisting the task registry/workspace mappings to survive plugin restarts.
- **Live event adapters:** Kimaki normalises OpenCode streaming events into UI-friendly notifications (including audio hooks). Their approach can inform richer Matrix progress/completion updates.
- **Automated guidelines:** Their `AGENTS.md` is generated from a script. Automating our internal docs (Matrix status, coordination design, etc.) would keep expectations aligned across contributors and agents.

## From `BloopAI/vibe-kanban`

- **Share bridge micro-service:** Vibe Kanban launches a local Axum server and points OpenCode’s `OPENCODE_API` at it. The bridge re-emits share events via a broadcast channel. Implementing a similar bridge would let us ingest structured tool events instead of parsing stdout.
- **Structured log normalisation:** Share events are parsed into `NormalizedEntry` records with action types, command outputs, and file metadata. We can reuse the idea to enrich Matrix completion summaries (e.g., explicit command runs, affected files).
- **Config via JSON Schema:** Their OpenCode executor exposes configuration through a schema (`shared/schemas/opencode.json`), enabling auto-generated UI forms. Publishing a schema for our MCP options would simplify downstream configuration.
- **Shell abstraction for portability:** They detect the user’s shell instead of hardcoding `bash -lc`. Adopting a similar helper would improve portability if we expand support beyond POSIX shells.

## Combined Next Steps

1. Prototype a share-bridge service (start/stop lifecycle tied to task execution) and wire its events into workspace logs and Matrix updates.
2. Extend Matrix completion messages to include structured information (command results, file diffs) sourced from share events.
3. Investigate persisting task/room state to a lightweight database so restarts do not drop in-flight task context.
4. Draft a JSON schema for plugin configuration to support external dashboards or CLI wizards.
5. Evaluate a supplementary CLI that can map chat channels to task workspaces, using Matrix today and drawing on Kimaki’s multi-project handshake flow.
