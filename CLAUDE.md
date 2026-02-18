# CLAUDE.md - AI-Native IDE Knowledge Base

This project implements an AI-Native IDE with Intent Management, Governance Intercepts, and Semantic Traceability.

## Build & Test Commands

- `npm run build`: Compile the TypeScript code.
- `npm test`: Run the test suite.
- `npm run dev`: Start the extension in development mode.

## Project Architecture

- **Intent Management**: Active intents stored in `.orchestration/active_intents.json`.
- **Governance**: Middleware pattern using `HookEngine.ts` in `src/hooks/`.
- **Traceability**: `agent_trace.jsonl` and `intent_map.md` track all code mutations.
- **Optimistic Locking**: File hashes in `HookEngine` prevent state drift.
- **Circuit Breaker**: Halts execution after 5 consecutive tool failures.

## Development Lessons

- Always call `select_active_intent` before any code mutation.
- Use `mutation_class` (EVOLUTION, REFACTOR, FIX, DOCS) for all file writes.
- `.intentignore` is strictly enforced to protect critical project infrastructure.
