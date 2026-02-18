import * as path from "path"
import * as fs from "fs/promises"

export async function getIntentContextSection(cwd: string, activeIntentId?: string): Promise<string> {
	if (!activeIntentId) {
		return `> [!NOTE]
> **No Active Intent Selected.** You are in "Exploration Mode". While you can discuss requirements and explore the codebase, you MUST call \`select_active_intent\` before performing any file modifications or executing commands to ensure traceability.`
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

		// Pull recent traces for this intent (Phase 1 Requirement)
		let traceSummary = ""
		try {
			const traceFile = path.join(orchestrationDir, "agent_trace.jsonl")
			const traceContent = await fs.readFile(traceFile, "utf-8")
			const traces = traceContent
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line))
				.filter((t: any) => {
					// Check related specifications in the first conversation of the first file (simplification)
					const firstConv = t.files?.[0]?.conversations?.[0]
					return firstConv?.related?.some(
						(r: any) => r.type === "specification" && r.value === activeIntentId,
					)
				})
				.slice(-5) // Last 5 traces

			if (traces.length > 0) {
				traceSummary = `\nRecent Transformations:\n${traces
					.map((t: any) => {
						const file = t.files[0]
						const conv = file.conversations[0]
						const mutationClass =
							conv.related.find((r: any) => r.type === "mutation_class")?.value ?? "UNKNOWN"
						const hash = conv.ranges[0].content_hash.substring(7, 14)
						return `- [${mutationClass}] ${file.relative_path} (${hash})`
					})
					.join("\n")}`
			}
		} catch (e) {
			// No traces yet or error reading trace file
		}

		return `<intent_context>
ID: ${intent.id}
Description: ${intent.description}
Scope: ${intent.scope?.join(", ") ?? "Not defined"}
Constraints:
${intent.constraints?.map((c: string) => `- ${c}`).join("\n") ?? "None"}${traceSummary}
</intent_context>
`
	} catch (error) {
		return `> [!ERROR]
> **Failed to load intent context.** ${error instanceof Error ? error.message : String(error)}`
	}
}
