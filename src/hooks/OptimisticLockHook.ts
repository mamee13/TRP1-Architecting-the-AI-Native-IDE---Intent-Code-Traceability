import * as path from "path"
import * as fs from "fs/promises"
import { IHook } from "./HookTypes"
import { HookContext, HookResponse, HookEngine } from "./HookEngine"
import { generateHash } from "../utils/crypto"
import { generateStructuralHash } from "../utils/ast"

export class OptimisticLockHook implements IHook {
	readonly name = "OptimisticLockHook"

	async onPreExecute(context: HookContext): Promise<HookResponse> {
		const { toolName, params, task } = context
		const engine = HookEngine.getInstance()

		if (["write_to_file", "apply_diff", "edit_file", "apply_patch"].includes(toolName) && params.path) {
			const absolutePath = path.resolve(task.cwd, params.path)
			const currentContent = await fs.readFile(absolutePath, "utf-8").catch(() => "")
			const currentHash = generateHash(currentContent)
			const expectedHash = engine.getLastReadHash(absolutePath)

			if (expectedHash && currentHash !== expectedHash) {
				return {
					allow: false,
					reason: `> [!CAUTION]\n> **Stale File Detected.** '${params.path}' has been modified externally. Please re-read to sync state.`,
				}
			}

			// Capture structural hash for classification
			const structuralHash = generateStructuralHash(currentContent, absolutePath)
			engine.setLastStructuralHash(absolutePath, structuralHash)
		}

		return { allow: true }
	}

	async onPostExecute(context: HookContext, result: any): Promise<void> {
		const { toolName, params, task } = context
		const engine = HookEngine.getInstance()

		if (toolName === "read_file" && params.path) {
			const absolutePath = path.resolve(task.cwd, params.path)
			const content = await fs.readFile(absolutePath, "utf-8").catch(() => "")
			engine.setLastReadHash(absolutePath, generateHash(content))
			await engine.persistState()
		}

		if (toolName === "write_to_file" && params.path) {
			const absolutePath = path.resolve(task.cwd, params.path)
			const content = params.content || ""
			engine.setLastReadHash(absolutePath, generateHash(content))
			engine.setLastStructuralHash(absolutePath, generateStructuralHash(content, absolutePath))
			await engine.persistState()
		}
	}
}
