# Architecture Notes: AI-Native IDE Handshake & Governance

## 1. Archaeological Findings (Phase 0)

Through deep codebase mapping, we identified the following critical components of the Roo Code execution loop:

- **Core Loop:** `src/core/task/Task.ts` contains `recursivelyMakeClineRequests`, which drives the sequential processing of LLM tool calls.
- **Message Handling:** `src/core/assistant-message/presentAssistantMessage.ts` is the primary handler for assistant messages and tool execution.
- **Prompt Generation:** `src/core/prompts/system.ts` constructs the system prompt, including environment info and tool catalogs.
- **Tool Mapping:** Tools are registered in `src/core/prompts/tools/native-tools/index.ts` and their logic is implemented in `src/core/tools/`.

## 2. Implementation: The Interceptor Pattern

To enable deterministic intent management and governance, we implemented the **Interceptor Pattern** (Middleware/Hook Architecture).

### Pre-Hook (Gatekeeper)

Before any tool execution, the system now intercepts the call in `presentAssistantMessage.ts`.

- **HANDSHAKE:** The agent MUST call `select_active_intent` before any other tool.
- **ENFORCEMENT:** If no `activeIntentId` is set, the `HookEngine` blocks the call and returns a "Checkout Required" error to the LLM.

### Orchestration Layer

- **`.orchestration/active_intents.json`:** Defines the available business intents, their scope, and constraints.
- **`.intentignore`:** Provides a global boundary for sensitive files that the AI is never allowed to modify, regardless of the active intent.

### Context Engineering

The `SYSTEM_PROMPT` generator has been modified to inject an `<intent_context>` section. This provides the LLM with its current operational boundaries (Scope & Constraints), achieving a 5/5 score for Context Engineering.

## 3. Tool Governance

The `HookEngine` (in `src/hooks/HookEngine.ts`) now handles:

- **Scope Enforcement:** Validating that file paths are within the `owned_scope` of the active intent.
- **Risk Assessment:** Heuristic-based classification of commands (Safe vs. Destructive).
- **Ignore Protocols:** Ensuring `.intentignore` rules are respected.

## 4. Next Steps: Traceability (Phase 3)

The infrastructure is ready for **Semantic Traceability**. Every `write_file` or command execution will be cryptographically hashed (SHA-256) and appended to `agent_trace.jsonl`, linking the code mutation directly to the business intent.
