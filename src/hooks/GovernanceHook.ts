import { IHook } from "./HookTypes"
import { HookContext, HookResponse, HookEngine } from "./HookEngine"

export class GovernanceHook implements IHook {
	readonly name = "GovernanceHook"

	private static readonly MUTATING_TOOLS = [
		"write_to_file",
		"apply_diff",
		"execute_command",
		"edit_file",
		"apply_patch",
	]
	private static readonly ESSENTIAL_TOOLS = ["select_active_intent", "switch_mode", "ask_followup_question"]
	private static readonly FAILURE_THRESHOLD = 5
	private static readonly MESSAGE_LIMIT = 40

	async onPreExecute(context: HookContext): Promise<HookResponse> {
		const { toolName, params, intentId, task } = context

		// 1. Mandatory Intent Check (The Gatekeeper)
		if (GovernanceHook.MUTATING_TOOLS.includes(toolName) && !intentId) {
			return {
				allow: false,
				reason: "> [!ERROR]\n> **Gatekeeper Violation.** You must call `select_active_intent` before performing code mutations or executing commands.",
			}
		}

		// 2. Intent ID Consistency
		if (params?.intent_id && intentId && params.intent_id !== intentId) {
			return {
				allow: false,
				reason: `> [!WARNING]\n> **Intent Mismatch detected.** You provided '${params.intent_id}' but active intent is '${intentId}'.`,
			}
		}

		// 3. Mutation Classification Requirement
		if (GovernanceHook.MUTATING_TOOLS.includes(toolName) && !params?.mutation_class) {
			return {
				allow: false,
				reason: `> [!IMPORTANT]\n> **Traceability Requirement.** You must provide a \`mutation_class\` (EVOLUTION, REFACTOR, FIX, DOCS) for this action.`,
			}
		}

		// 4. Circuit Breaker
		if (task.consecutiveMistakeCount >= GovernanceHook.FAILURE_THRESHOLD) {
			return {
				allow: false,
				reason: `> [!STOP]\n> **Circuit Breaker Triggered.** You have reached the consecutive failure threshold (${GovernanceHook.FAILURE_THRESHOLD}).`,
			}
		}

		// 5. Context Compaction Warning
		if (task.clineMessages.length > GovernanceHook.MESSAGE_LIMIT) {
			return {
				allow: true,
				reason: `> [!WARNING]\n> **Context Rot Detection.** Your conversation history is at ${task.clineMessages.length} messages. Consider summarizing to CLAUDE.md.`,
			}
		}

		return { allow: true }
	}
}
