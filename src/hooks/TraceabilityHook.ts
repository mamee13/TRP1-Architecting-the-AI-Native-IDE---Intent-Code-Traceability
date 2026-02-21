import * as path from "path"
import * as fs from "fs/promises"
import * as crypto from "crypto"
import { IHook } from "./HookTypes"
import { HookContext } from "./HookEngine"
import { generateHash } from "../utils/crypto"
import { generateStructuralHash } from "../utils/ast"

export class TraceabilityHook implements IHook {
	readonly name = "TraceabilityHook"

	async onPostExecute(context: HookContext, result: any): Promise<void> {
		const { toolName, params, intentId, task } = context
		if ((toolName === "write_to_file" || toolName === "apply_diff") && !result?.isError) {
			try {
				const orchestrationDir = path.join(task.cwd, ".orchestration")
				await fs.mkdir(orchestrationDir, { recursive: true })

				const traceFile = path.join(orchestrationDir, "agent_trace.jsonl")

				let contentHash = ""
				let content = ""
				if (toolName === "write_to_file" && params.content) {
					content = params.content
					contentHash = generateHash(content)
				} else if (params.path) {
					const absolutePath = path.resolve(task.cwd, params.path)
					content = await fs.readFile(absolutePath, "utf-8").catch(() => "")
					contentHash = generateHash(content)
				}

				const trace = {
					id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
					timestamp: new Date().toISOString(),
					vcs: { revision_id: "local" },
					files: [
						{
							relative_path: params.path || params.file_path,
							conversations: [
								{
									url: task.taskId || "local-session",
									contributor: { entity_type: "AI", model_identifier: "assistant" },
									ranges: [{ start_line: 1, end_line: 0, content_hash: `sha256:${contentHash}` }],
									related: [
										{ type: "specification", value: intentId },
										{
											type: "mutation_class",
											value: params.mutation_class || "EVOLUTION",
										},
										{
											type: "structural_hash",
											value: `sha256:${generateStructuralHash(content, params.path ? path.resolve(task.cwd, params.path) : undefined)}`,
										},
									],
								},
							],
						},
					],
					status: "success",
					toolName,
				}

				await fs.appendFile(traceFile, JSON.stringify(trace) + "\n")
				await this.updateIntentMap(task.cwd, trace)
			} catch (error) {
				console.error("[TRACE] Failed to generate agent trace:", error)
			}
		}
	}

	private async updateIntentMap(cwd: string, trace: any): Promise<void> {
		const mapFile = path.join(cwd, ".orchestration", "intent_map.md")
		const date = new Date().toLocaleDateString()
		const file = trace.files[0]
		const conv = file.conversations[0]
		const intentId = conv.related.find((r: any) => r.type === "specification")?.value ?? "UNKNOWN"
		const mutationClass = conv.related.find((r: any) => r.type === "mutation_class")?.value ?? "UNKNOWN"
		const hash = conv.ranges[0].content_hash.substring(7, 14)

		const line = `| ${date} | ${intentId} | ${file.relative_path} | ${mutationClass} | ${hash} |\n`

		try {
			let content = ""
			try {
				content = await fs.readFile(mapFile, "utf-8")
			} catch (e) {
				content =
					"# Intent-to-Code Spatial Map\n\n| Date | Intent ID | File Path | Mutation Class | Content Hash |\n| :--- | :--- | :--- | :--- | :--- |\n"
			}
			if (!content.includes(hash)) {
				await fs.appendFile(mapFile, line)
			}
		} catch (error) {
			console.error("Failed to update intent map:", error)
		}
	}
}
