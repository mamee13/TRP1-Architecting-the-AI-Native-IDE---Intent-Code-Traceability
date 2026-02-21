# CLAUDE.md - AI-Native IDE Knowledge Base

This project implements an AI-Native IDE with Intent Management, Governance Intercepts, and Semantic Traceability.

## Build & Test Commands

- `npm run build`: Compile the TypeScript code.
- `npm test`: Run the test suite.
- `npm run dev`: Start the extension in development mode.

## Project Architecture

## Orchestration Patterns

- **Golden Thread**: Handshake -> Pre-Hook -> Execution -> Post-Hook -> Trace.
- **Middleware Pattern**: HookEngine uses a registry of independent `IHook` implementations (Governance, Scope, Trace, Lock).
- **Spatial Mapping**: Intents map to code ranges via content hashes in `.orchestration/intent_map.md`.

- **Intent Management**: Active intents stored in `.orchestration/active_intents.json`.
- **Governance**: Middleware pattern using `HookEngine.ts` in `src/hooks/`.
- **Traceability**: `agent_trace.jsonl` and `intent_map.md` track all code mutations.
- **Optimistic Locking**: File hashes in `HookEngine` prevent state drift.
- **Circuit Breaker**: Halts execution after 5 consecutive tool failures.

## Lessons Learned

- **Locking Persistence**: Always call `persistState()` after record updates to survive extension host restarts.
- **Non-Structural AST**: Structural hashes should ignore `NewLineTrivia` and `CommentTrivia` to prevent false positive evolution signals.
- **Advisory Warnings**: Use recommendations instead of hard blocks for context compaction to avoid agent deadlocks.

## Development Lessons

- Always call `select_active_intent` before any code mutation.
- Use `mutation_class` (EVOLUTION, REFACTOR, FIX, DOCS) for all file writes.
- `.intentignore` is strictly enforced to protect critical project infrastructure.
