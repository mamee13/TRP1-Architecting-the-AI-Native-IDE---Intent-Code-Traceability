import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import * as crypto from "crypto"
import { Task } from "../core/task/Task"
import { ToolName } from "@roo-code/types"
import { generateHash } from "../utils/crypto"
import { generateStructuralHash, isStructurallyEquivalent } from "../utils/ast"

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
	private lastReadHashes: Map<string, string> = new Map()
	private lastStructuralHashes: Map<string, string> = new Map()

	private static readonly MUTATING_TOOLS: ToolName[] = [
		"write_to_file",
		"apply_diff",
		"execute_command",
		"edit_file",
		"apply_patch",
	]
	private static readonly ESSENTIAL_TOOLS: ToolName[] = [
		"select_active_intent",
		"switch_mode",
		"ask_followup_question",
	]

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
		console.log(`[GOVERNANCE] HookEngine.onPreExecute: tool=${toolName}, intent=${intentId || "NONE"}`)

		// 1. Mandatory Intent Check (The Gatekeeper)
		// Relaxed: Allow conversational, planning, and read-only tools without an intent.
		if (HookEngine.MUTATING_TOOLS.includes(toolName) && !intentId) {
			console.log(`[GOVERNANCE] Gatekeeper: Blocking mutation ${toolName} - No active intent.`)
			return {
				allow: false,
				reason: "> [!ERROR]\n> **Gatekeeper Violation.** You must call `select_active_intent` before performing code mutations or executing commands.",
			}
		}

		if (!intentId && !HookEngine.ESSENTIAL_TOOLS.includes(toolName)) {
			console.log(`[GOVERNANCE] Gatekeeper: Monitoring ${toolName} (Conversational/Read-Only) - Passive mode.`)
		}

		// 2. Intent ID Consistency
		if (params?.intent_id && intentId && params.intent_id !== intentId) {
			console.log(`[GOVERNANCE] Intent Mismatch: params=${params.intent_id} vs state=${intentId}`)
			return {
				allow: false,
				reason: `> [!WARNING]\n> **Intent Mismatch detected.** You provided '${params.intent_id}' but active intent is '${intentId}'.`,
			}
		}

		// 3. Mutation Classification Requirement (Phase 3)
		if (HookEngine.MUTATING_TOOLS.includes(toolName) && !params?.mutation_class) {
			console.log(`[GOVERNANCE] Missing Mutation Class for ${toolName}`)
			return {
				allow: false,
				reason: `> [!IMPORTANT]\n> **Traceability Requirement.** You must provide a \`mutation_class\` (EVOLUTION, REFACTOR, FIX, DOCS) for this action.`,
			}
		}

		// 4. Optimistic Locking (Phase 4)
		if (HookEngine.MUTATING_TOOLS.includes(toolName) && params.path) {
			const absolutePath = path.resolve(task.cwd, params.path)
			const currentContent = await fs.readFile(absolutePath, "utf-8").catch(() => "")
			const currentHash = generateHash(currentContent)
			const expectedHash = this.lastReadHashes.get(absolutePath)

			console.log(`[ORCHESTRATION] Optimistic Lock Check: ${params.path}`)
			console.log(
				`[ORCHESTRATION] State: Current=${currentHash.substring(0, 7)}, Expected=${expectedHash?.substring(0, 7) || "NONE"}`,
			)

			if (expectedHash && currentHash !== expectedHash) {
				console.log(`[ORCHESTRATION] !!! STALE FILE DETECTED !!! - ${params.path}`)
				return {
					allow: false,
					reason: `> [!CAUTION]\n> **Stale File Detected.** '${params.path}' has been modified externally since you last read it. Please re-read the file to sync state before writing.`,
				}
			}

			// Store structural hash for post-execute classification
			const structuralHash = generateStructuralHash(currentContent)
			this.lastStructuralHashes.set(absolutePath, structuralHash)
			console.log(`[AST] Pre-mutation structural hash for ${params.path}: ${structuralHash.substring(0, 7)}`)
		}

		// 5. Scope Enforcement (Phase 2)
		if (intentId) {
			const scopeResponse = await this.checkScope(task.cwd, intentId, toolName, params)
			if (!scopeResponse.allow) {
				console.log(`[GOVERNANCE] Scope Violation: ${scopeResponse.reason}`)
				return scopeResponse
			}
		}

		// 6. Circuit Breaker (Phase 4)
		const FAILURE_THRESHOLD = 5
		if (task.consecutiveMistakeCount >= FAILURE_THRESHOLD) {
			console.log(`[ORCHESTRATION] Circuit Breaker Tripped: ${task.consecutiveMistakeCount} failures`)
			return {
				allow: false,
				reason: `> [!STOP]\n> **Circuit Breaker Triggered.** You have reached the consecutive failure threshold (${FAILURE_THRESHOLD}). \n> To prevent infinite loops and resource exhaustion, execution is halted. \n> **Action Required:** Please review your recent errors and adjust your strategy before continuing.`,
			}
		}

		// 7. Risk Assessment & HITL (Phase 2)
		const destructivePatterns = ["rm ", "sudo ", "mkfs ", "> /dev/"]
		if (toolName === "execute_command") {
			const command = params.command || ""
			if (destructivePatterns.some((pattern) => command.includes(pattern))) {
				console.log(`[GOVERNANCE] High-Risk Command Detected: ${command}`)
				// Note: In Roo Code, HITL is usually handled by the provider.
				// Here we simulate the guardrail check.
				const approved = await vscode.window.showWarningMessage(
					`High-Risk Action Detected: ${command}. Do you approve?`,
					"Approve",
					"Reject",
				)

				if (approved !== "Approve") {
					console.log(`[GOVERNANCE] User REJECTED high-risk action: ${command}`)
					return {
						allow: false,
						reason: "User rejected this high-risk action. Please find a safer alternative.",
					}
				}
				console.log(`[GOVERNANCE] User APPROVED high-risk action: ${command}`)
			}
		}

		// 7. Context Compaction (Master Thinker)
		const MESSAGE_LIMIT = 40
		if (task.clineMessages.length > MESSAGE_LIMIT) {
			console.log(`[GOVERNANCE] Context Rot Detected: ${task.clineMessages.length} messages. Forcing compaction.`)
			return {
				allow: false,
				reason: `> [!STOP]\n> **Context Rot Mitigation.** Your conversation history is currently at ${task.clineMessages.length} messages. This exceeds the project's signal-to-noise threshold. \n> **Required Action:** You must summarize the current progress and architectural state into \`CLAUDE.md\` or \`AGENT.md\`, then start a new task session to reset context.`,
			}
		}

		console.log(`[GOVERNANCE] HookEngine: PASSED all pre-checks for ${toolName}`)
		if (HookEngine.ESSENTIAL_TOOLS.includes(toolName)) {
			console.log(`[GOVERNANCE] Tool Params: ${JSON.stringify(params)}`)
		}
		return { allow: true }
	}

	private assessRisk(toolName: string, params: any): "safe" | "destructive" {
		const destructiveTools = ["execute_command", "write_to_file", "apply_diff", "edit_file", "apply_patch"]
		if (!destructiveTools.includes(toolName)) return "safe"

		if (toolName === "execute_command") {
			const cmd = params.command.toLowerCase()
			// Refined Regex Assessment (Phase 2)
			const destructiveRegex =
				/\b(rm|chmod|chown|shred|systemctl|sudo|truncate|mv|cp)\b.*(-f|--force|\/dev\/|\/etc\/|\/boot\/)/i
			if (destructiveRegex.test(cmd) || cmd.includes("> /dev/")) {
				return "destructive"
			}
		}

		// All file writes are considered semi-destructive but we reserve "destructive"
		// for high-risk system operations for the HITL UI demo.
		return "safe"
	}

	private async askForHITLApproval(toolName: string, params: any): Promise<boolean> {
		const target = params.command || params.path || "target action"
		const result = await vscode.window.showWarningMessage(
			`GOVERNANCE ALERT: Destructive action detected (${toolName}). Proceed?`,
			{ modal: true, detail: `Target: ${target}` },
			"Allow",
			"Block",
		)
		return result === "Allow"
	}

	/**
	 * Post-Hook: Executed after tool completion.
	 * Updates spatial hashes and generates traces.
	 */
	public async onPostExecute(context: HookContext, result: any): Promise<void> {
		const { toolName, params, intentId, task } = context
		console.log(
			`[GOVERNANCE] HookEngine.onPostExecute: tool=${toolName}, status=${result?.isError ? "FAILURE" : "SUCCESS"}`,
		)

		// 1. Update Optimistic Locking state
		if (toolName === "read_file" && params.path) {
			const absolutePath = path.resolve(task.cwd, params.path)
			try {
				const content = await fs.readFile(absolutePath, "utf-8")
				const hash = generateHash(content)
				this.lastReadHashes.set(absolutePath, hash)
				console.log(`[ORCHESTRATION] Updated Read Hash for ${params.path}: ${hash.substring(0, 7)}`)
			} catch (e) {
				console.log(`[ORCHESTRATION] Failed to update read hash for ${params.path}`)
			}
		}

		if (toolName === "write_to_file" && params.path) {
			const absolutePath = path.resolve(task.cwd, params.path)
			const content = params.content || ""
			const hash = generateHash(content)
			this.lastReadHashes.set(absolutePath, hash)

			const structuralHash = generateStructuralHash(content)
			this.lastStructuralHashes.set(absolutePath, structuralHash)

			console.log(`[ORCHESTRATION] Updated Write Hash for ${params.path}: ${hash.substring(0, 7)}`)
			console.log(`[AST] Updated Structural Hash for ${params.path}: ${structuralHash.substring(0, 7)}`)
		}

		// 2. Generate Agent Trace (Phase 3 & Day 3)
		if ((toolName === "write_to_file" || toolName === "apply_diff") && !result?.isError) {
			try {
				console.log(`[TRACE] Generating transformation record for ${params.path || params.file_path}...`)
				const orchestrationDir = path.join(task.cwd, ".orchestration")
				// Ensure directory exists (Phase 4 Robustness)
				await fs.mkdir(orchestrationDir, { recursive: true })

				const traceFile = path.join(orchestrationDir, "agent_trace.jsonl")
				console.log(`[TRACE] Logging transformation to ${traceFile}`)

				let contentHash = ""
				if (params.path) {
					const absolutePath = path.resolve(task.cwd, params.path)
					const content = await fs.readFile(absolutePath, "utf-8").catch(() => "")
					contentHash = generateHash(content)
				}

				const trace = {
					id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
					timestamp: new Date().toISOString(),
					vcs: { revision_id: "local" }, // Placeholder for git SHA
					files: [
						{
							relative_path: params.path || params.file_path,
							conversations: [
								{
									url: task.taskId || "local-session",
									contributor: {
										entity_type: "AI",
										model_identifier: "assistant",
									},
									ranges: [
										{
											start_line: 1, // Full file or diff range
											end_line: contentHash ? 0 : 0, // Simplified for now
											content_hash: `sha256:${contentHash}`,
										},
									],
									related: [
										{
											type: "specification",
											value: params.intent_id || intentId,
										},
										{
											type: "mutation_class",
											value: await this.classifyMutation(
												task.cwd,
												params.path || params.file_path,
											),
										},
										{
											type: "structural_hash",
											value: `sha256:${generateStructuralHash(
												await fs
													.readFile(path.resolve(task.cwd, params.path || ""), "utf-8")
													.catch(() => ""),
											)}`,
										},
									],
								},
							],
						},
					],
					status: "success",
					toolName, // Metadata
				}

				await fs.appendFile(traceFile, JSON.stringify(trace) + "\n")
				console.log(`[TRACE] => agent_trace.jsonl updated (${trace.id.substring(0, 8)})`)

				// Also update intent_map.md (Day 3 requirement)
				await this.updateIntentMap(task.cwd, trace)
				console.log(`[TRACE] => intent_map.md updated (Spatial Map)`)

				// 3. Context Compaction Hook (Phase 4)
				const MESSAGE_THRESHOLD = 50
				if (task.clineMessages.length > MESSAGE_THRESHOLD) {
					console.warn(
						`[GOVERNANCE] !!! CONTEXT ROT DETECTED !!!: ${task.clineMessages.length} messages. Consider summarization to preserve signal-to-noise ratio.`,
					)
				}
			} catch (error) {
				console.error("Failed to generate agent trace:", error)
			}
		}
	}

	private async classifyMutation(taskCwd: string, filePath: string | undefined): Promise<string> {
		if (!filePath) return "UNKNOWN"
		const absolutePath = path.resolve(taskCwd, filePath)
		const prevHash = this.lastStructuralHashes.get(absolutePath)

		try {
			const currentContent = await fs.readFile(absolutePath, "utf-8")
			const currentHash = generateStructuralHash(currentContent)

			if (prevHash && currentHash === prevHash) {
				console.log(`[AST] Structural match detected for ${filePath} - Auto-classifying as AST_REFACTOR`)
				return "AST_REFACTOR"
			}
		} catch (e) {
			console.log(`[AST] Could not read file for classification: ${filePath}`)
		}

		return "EVOLUTION"
	}

	/**
	 * Spatial Map: Maintains intent_map.md for business-to-code mapping.
	 */
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
				// Initialize map file if it doesn't exist
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
