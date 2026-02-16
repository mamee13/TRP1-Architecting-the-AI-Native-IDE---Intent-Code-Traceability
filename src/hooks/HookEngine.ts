import * as path from "path"
import * as fs from "fs/promises"
import { Task } from "../core/task/Task"
import { ToolName } from "@roo-code/types"
import { ToolUse } from "../shared/tools"

export interface HookContext {
	task: Task
	toolName: ToolName
	params: any
	intentId?: string
}

export interface HookResponse {
	allow: boolean
	reason?: string
}

export class HookEngine {
	private static instance: HookEngine

	private constructor() {}

	public static getInstance(): HookEngine {
		if (!HookEngine.instance) {
			HookEngine.instance = new HookEngine()
		}
		return HookEngine.instance
	}

	/**
	 * Pre-Hook: Executed before any tool runs.
	 * Handles scope enforcement and global governance.
	 */
	public async onPreExecute(context: HookContext): Promise<HookResponse> {
		const { toolName, params, intentId, task } = context

		// 1. Mandatory Intent Execution
		if (!intentId && toolName !== "select_active_intent") {
			return {
				allow: false,
				reason: `> [!STOP]
> **Orchestration Gatekeeper Triggered.** You are attempting to call \`${toolName}\` without an active intent. 
> You MUST call \`select_active_intent\` first to link your actions to a business goal.`,
			}
		}

		// 2. Scope Enforcement
		if (intentId && toolName !== "select_active_intent") {
			const isScoped = await this.checkScope(task.cwd, intentId, toolName, params)
			if (!isScoped.allow) {
				return isScoped
			}
		}

		// 3. Risk Assessment (for HITL)
		const isDestructive = this.checkRisk(toolName, params)
		if (isDestructive) {
			// We return allow: true but we could flag it for HITL.
			// For this challenge, we'll let the presentAssistantMessage handle the UI if it needs approval.
		}

		return { allow: true }
	}

	private checkRisk(toolName: string, params: any): boolean {
		const destructiveTools = ["execute_command", "write_to_file", "apply_diff", "edit_file", "apply_patch"]
		if (!destructiveTools.includes(toolName)) return false

		if (toolName === "execute_command") {
			const cmd = params.command.toLowerCase()
			const patterns = ["rm ", "chmod ", "chown ", "shred ", "> /dev/", "systemctl ", "sudo "]
			if (patterns.some((p) => cmd.includes(p))) return true
		}

		return true
	}

	/**
	 * Post-Hook: Executed after a tool successfully completes.
	 * Handles traceability and state updates.
	 */
	public async onPostExecute(context: HookContext, result: any): Promise<void> {
		// This will be implemented in Phase 3
	}

	/**
	 * Scope Enforcement logic.
	 * Matches file paths against the intent's owned_scope.
	 */
	private async checkScope(cwd: string, intentId: string, toolName: string, params: any): Promise<HookResponse> {
		// Only enforce scope for file-system and command tools
		const scopedTools = ["write_to_file", "apply_diff", "execute_command", "edit_file", "apply_patch"]
		if (!scopedTools.includes(toolName)) {
			return { allow: true }
		}

		try {
			const orchestrationDir = path.join(cwd, ".orchestration")
			const intentsFile = path.join(orchestrationDir, "active_intents.json")
			const fileContent = await fs.readFile(intentsFile, "utf-8")
			const data = JSON.parse(fileContent)
			const intent = data?.intents?.find((i: any) => i.id === intentId)

			if (!intent) {
				return { allow: false, reason: `Intent '${intentId}' not found.` }
			}

			const scope = intent.scope || []
			if (scope.includes("*")) return { allow: true }

			// Extract path from params
			const targetPath = params.path || params.file_path || params.cwd || "."
			const absoluteTargetPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(cwd, targetPath)

			const isAllowed = scope.some((pattern: string) => {
				const absolutePattern = path.resolve(cwd, pattern.replace(/\*$/, ""))
				return absoluteTargetPath.startsWith(absolutePattern)
			})

			if (!isAllowed) {
				return {
					allow: false,
					reason: `Scope Violation: You are attempting to access '${targetPath}' which is outside the scope of intent '${intentId}'.`,
				}
			}

			return { allow: true }
		} catch (error) {
			return {
				allow: false,
				reason: `Scope check failed: ${error instanceof Error ? error.message : String(error)}`,
			}
		}
	}
}
