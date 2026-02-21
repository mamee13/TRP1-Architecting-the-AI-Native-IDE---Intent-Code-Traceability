import * as path from "path"
import * as fs from "fs/promises"
import * as yaml from "yaml"
import { IHook } from "./HookTypes"
import { HookContext, HookResponse } from "./HookEngine"

export class ScopeEnforcementHook implements IHook {
	readonly name = "ScopeEnforcementHook"

	async onPreExecute(context: HookContext): Promise<HookResponse> {
		const { toolName, params, intentId, task } = context
		if (!intentId) return { allow: true }

		const scopedTools = ["write_to_file", "apply_diff", "execute_command", "edit_file", "apply_patch"]
		if (!scopedTools.includes(toolName)) return { allow: true }

		try {
			const orchestrationDir = path.join(task.cwd, ".orchestration")
			const intentsFile = path.join(orchestrationDir, "active_intents.yaml")
			const fileContent = await fs.readFile(intentsFile, "utf-8")
			const data = yaml.parse(fileContent)
			const intents = Array.isArray(data) ? data : data?.active_intents || []
			const intent = intents.find((i: any) => i.id === intentId)

			if (!intent) return { allow: false, reason: `Intent '${intentId}' not found.` }

			const scope = intent.owned_scope || intent.scope || []
			if (scope.includes("*")) return { allow: true }

			const targetPath = params.path || params.file_path || params.cwd || "."
			const absoluteTargetPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(task.cwd, targetPath)

			const isAllowed = scope.some((pattern: string) => {
				const absolutePattern = path.resolve(task.cwd, pattern.replace(/\*$/, ""))
				return absoluteTargetPath.startsWith(absolutePattern)
			})

			if (!isAllowed) {
				return {
					allow: false,
					reason: `Scope Violation: You are attempting to access '${targetPath}' outside intent '${intentId}' scope.`,
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
