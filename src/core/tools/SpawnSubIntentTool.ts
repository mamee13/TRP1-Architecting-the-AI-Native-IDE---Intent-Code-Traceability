import * as path from "path"
import fs from "fs/promises"

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
		const intentsFile = path.join(orchestrationDir, "active_intents.json")
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
			let data: any = { intents: [] }
			try {
				const fileContent = await fs.readFile(intentsFile, "utf-8")
				data = JSON.parse(fileContent)
			} catch (error) {
				// Initialize if file doesn't exist
			}

			// 2. Business Logic Checks
			if (data.intents.some((i: any) => i.id === id)) {
				pushToolResult(`Error: Intent ID '${id}' already exists.`)
				return
			}

			if (parent_id !== "root" && !data.intents.some((i: any) => i.id === parent_id)) {
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

			data.intents.push(newIntent)

			// 3. Atomic Write
			await fs.writeFile(intentsFile, JSON.stringify(data, null, 2), "utf-8")

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
