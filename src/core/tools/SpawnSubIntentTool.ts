import * as path from "path"
import * as fs from "fs/promises"
import * as yaml from "yaml"

import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface SpawnSubIntentParams {
	id: string
	description: string
	scope: string[]
	parent_id: string
	constraints?: string[]
	acceptance_criteria?: string[]
}

export class SpawnSubIntentTool extends BaseTool<"spawn_sub_intent"> {
	readonly name = "spawn_sub_intent" as const

	async execute(params: SpawnSubIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { id, description, scope, parent_id, constraints, acceptance_criteria } = params
		const { pushToolResult, handleError } = callbacks

		const orchestrationDir = path.join(task.cwd, ".orchestration")
		const intentsFile = path.join(orchestrationDir, "active_intents.yaml")
		const lockFile = path.join(orchestrationDir, "active_intents.lock")

		// 1. Acquire Lock (Simple retry-based advisory lock)
		let acquired = false
		const maxRetries = 10
		const retryDelay = 100

		for (let i = 0; i < maxRetries; i++) {
			try {
				// Use 'wx' flag to fail if the lock file already exists (atomic creation)
				const handle = await fs.open(lockFile, "wx")
				await handle.close()
				acquired = true
				break
			} catch (e: any) {
				if (e.code === "EEXIST") {
					await new Promise((resolve) => setTimeout(resolve, retryDelay))
				} else {
					throw e
				}
			}
		}

		if (!acquired) {
			pushToolResult(`Error: Could not acquire lock for orchestration ledger. Please try again.`)
			return
		}

		try {
			let data: any = []
			let isRootList = true

			try {
				const fileContent = await fs.readFile(intentsFile, "utf-8")
				const parsed = yaml.parse(fileContent)
				if (Array.isArray(parsed)) {
					data = parsed
					isRootList = true
				} else if (parsed && typeof parsed === "object" && Array.isArray(parsed.active_intents)) {
					data = parsed.active_intents
					isRootList = false
				} else {
					// Fallback for unexpected format
					data = []
					isRootList = true
				}
			} catch (error) {
				// Initialize if file doesn't exist
			}

			// 2. Business Logic Checks
			if (data.some((i: any) => i.id === id)) {
				pushToolResult(`Error: Intent ID '${id}' already exists.`)
				return
			}

			if (parent_id !== "root" && !data.some((i: any) => i.id === parent_id)) {
				pushToolResult(`Error: Parent Intent ID '${parent_id}' not found.`)
				return
			}

			const newIntent = {
				id,
				description,
				status: "active",
				scope,
				parent_id,
				constraints: constraints || [],
				acceptance_criteria: acceptance_criteria || [],
				created_at: new Date().toISOString(),
			}

			data.push(newIntent)

			// 3. Atomic Write
			const outputData = isRootList ? data : { active_intents: data }
			await fs.writeFile(intentsFile, yaml.stringify(outputData), "utf-8")

			pushToolResult(
				`Success: Spawned sub-intent '${id}' under parent '${parent_id}'. The orchestration ledger has been updated.`,
			)
		} catch (error) {
			await handleError("spawning sub-intent", error as Error)
		} finally {
			// 4. Release Lock
			await fs.unlink(lockFile).catch(() => {})
		}
	}
}

export const spawnSubIntentTool = new SpawnSubIntentTool()
