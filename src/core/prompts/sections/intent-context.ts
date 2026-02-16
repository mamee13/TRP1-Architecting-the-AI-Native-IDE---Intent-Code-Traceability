import * as path from "path"
import * as fs from "fs/promises"

export async function getIntentContextSection(cwd: string, activeIntentId?: string): Promise<string> {
	if (!activeIntentId) {
		return `> [!IMPORTANT]
> **No Active Intent Selected.** You MUST call \`select_active_intent\` before performing any file modifications or executing commands. This ensures all actions are tracked and governed.`
	}

	try {
		const orchestrationDir = path.join(cwd, ".orchestration")
		const intentsFile = path.join(orchestrationDir, "active_intents.json")

		const fileContent = await fs.readFile(intentsFile, "utf-8")
		const data = JSON.parse(fileContent)
		const intent = data?.intents?.find((i: any) => i.id === activeIntentId)

		if (!intent) {
			return `> [!WARNING]
> **Active Intent '${activeIntentId}' not found in orchestration layer.** Please re-select a valid intent.`
		}

		return `<intent_context>
ID: ${intent.id}
Description: ${intent.description}
Scope: ${intent.scope?.join(", ") ?? "Not defined"}
Constraints:
${intent.constraints?.map((c: string) => `- ${c}`).join("\n") ?? "None"}
</intent_context>

You are currently working under the governance of the above intent. Ensure all your actions align with its scope and constraints.`
	} catch (error) {
		return `> [!ERROR]
> **Failed to load intent context.** ${error instanceof Error ? error.message : String(error)}`
	}
}
