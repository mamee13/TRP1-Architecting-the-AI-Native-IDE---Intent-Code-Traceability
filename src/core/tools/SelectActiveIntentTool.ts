import * as path from "path"
import fs from "fs/promises"

import { Task } from "../task/Task"
import { BaseTool, ToolCallbacks } from "./BaseTool"

interface SelectActiveIntentParams {
	intent_id: string
}

export class SelectActiveIntentTool extends BaseTool<"select_active_intent"> {
	readonly name = "select_active_intent" as const

	async execute(params: SelectActiveIntentParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { intent_id } = params
		const { pushToolResult, handleError } = callbacks

		try {
			const orchestrationDir = path.join(task.cwd, ".orchestration")
			const intentsFile = path.join(orchestrationDir, "active_intents.json")

			let fileContent: string
			try {
				fileContent = await fs.readFile(intentsFile, "utf-8")
			} catch (error) {
				pushToolResult(
					`Error: Could not find .orchestration/active_intents.json. Please ensure the orchestration layer is initialized.`,
				)
				return
			}

			const data = JSON.parse(fileContent)
			const intent = data?.intents?.find((i: any) => i.id === intent_id)

			if (!intent) {
				pushToolResult(`Error: Intent ID '${intent_id}' not found in .orchestration/active_intents.json.`)
				return
			}

			// Store the active intent ID in the task instance.
			;(task as any).activeIntentId = intent_id

			pushToolResult(
				`Success: Active intent set to '${intent_id}' (${intent.description}). You may now proceed with actions linked to this intent.`,
			)
		} catch (error) {
			await handleError("selecting active intent", error as Error)
		}
	}
}

export const selectActiveIntentTool = new SelectActiveIntentTool()
