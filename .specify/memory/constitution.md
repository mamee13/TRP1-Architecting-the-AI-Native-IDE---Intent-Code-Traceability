# AI-Native IDE Constitution

## Core Principles

### I. Governance-First Architecture

Governance is the non-negotiable core of this system. All agentic operations must pass through a **Deterministic Hook Engine** (Middleware) that intercepts tool calls at critical lifecycle junctures (PreToolUse/PostToolUse). This ensures operational rules are hardcoded and enforced regardless of the AI model's probabilistic output.

### II. Intent-Driven Traceability

All modifications to the codebase must be bidirectionally traceable to a formalized **Business Intent**. We treat the codebase as a collection of formalized intents rather than just text. Every line of code must correlate to a Requirement ID (REQ-ID) through the **Agent Trace** specification.

### III. Plan-First execution (NON-NEGOTIABLE)

Agents are forbidden from writing code or executing destructive commands immediately upon receiving a prompt. Every task must begin with an **Implementation Plan** and architectural walkthrough. Execution can only proceed after Human-in-the-Loop (HITL) verification.

### IV. Spatial Independence via Content Hashing

Attribution must never rely on volatile line numbers. All trace records must utilize **Content Hashing** (SHA-256) of code blocks/AST nodes. This ensures that the "Golden Thread" between intent and code remains intact even as files are refactored or code is moved.

### V. Multi-Agent Orchestration (Shared Brain)

When multiple specialized agents (Architect, Builder, Tester) operate concurrently, they must coordinate via a **Shared Brain** (`AGENT.md` or `CLAUDE.md`). This persistent state container prevents "Context Rot" and ensures the "Hive Mind" remains aligned with the project's evolving architecture.

## Architectural Constraints

### 1. Sidecar State Management

The project's intent state and audit trails must be stored in the `.orchestration/` directory using machine-managed formats (YAML/JSONL). This pattern ensures non-destructive metadata management without polluting the source code AST.

### 2. Privilege Separation

The system must maintain strict isolation between the restricted **Webview UI** (Presentation) and the **Extension Host** (Logic/Secrets). Direct access to Node.js APIs from the frontend is strictly prohibited.

### 3. Context Compaction

To prevent "Context Rot" and token explosion, the system must implement regular **PreCompact** hooks. Conversation history must be summarized, and raw tool outputs truncated before passing context to subsequent agent turns.

## Development Workflow

### Two-Stage State Machine

Every agent interaction follows a strict protocol:

1.  **Stage 1 (Reasoning Intercept):** Agent analyzes request and calls `select_active_intent(intent_id)`. Pre-Hook pauses execution and injects deep intent context.
2.  **Stage 2 (Contextualized Action):** Agent executes the task using injected context. Post-Hook records the mutation class and calculates content hashes for the ledger.

### Human-in-the-Loop (HITL) Gate

All "Destructive" commands (file writes, terminal execution, deletions) must be intercepted by the Hook Engine. The system must present a UI-blocking modal for user authorization. Rejection of a command triggers an **Autonomous Recovery Loop**.

## Governance Rules

### Immutable Ledger

The `.orchestration/agent_trace.jsonl` file is an append-only ledger. It acts as the "AI-Native Git," recording the reasoning process, the model used, and the cryptographic link to the intent.

### Optimistic Locking

Before any file write, the system must compute the current `content_hash` of the target. If it differs from the hash recorded at the start of the task, the write must be blocked (Stale File Error) to prevent collision between parallel agents or human edits.

**Version**: 1.0.0 | **Ratified**: 2026-02-17 | **Last Amended**: 2026-02-17
