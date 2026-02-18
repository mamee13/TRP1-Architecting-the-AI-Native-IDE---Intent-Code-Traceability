import { describe, it, expect, vi, beforeEach } from "vitest"
import { HookEngine, HookContext } from "../HookEngine"
import * as fs from "fs/promises"
import * as path from "path"
import { generateHash } from "../../utils/crypto"
import { generateStructuralHash } from "../../utils/ast"
import * as vscode from "vscode"

// Mock dependencies
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	appendFile: vi.fn(),
	mkdir: vi.fn(),
}))
vi.mock("../../utils/crypto")
vi.mock("../../utils/ast")
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(),
	},
}))

describe("HookEngine", () => {
	let engine: HookEngine
	let mockTask: any

	beforeEach(() => {
		vi.clearAllMocks()
		// @ts-ignore - access private instance for testing
		HookEngine.instance = undefined
		engine = HookEngine.getInstance()

		mockTask = {
			cwd: "/test/workspace",
			consecutiveMistakeCount: 0,
			clineMessages: [],
		}

		// Default mocks
		vi.mocked(generateHash).mockImplementation((s) => `hash-${s}`)
		vi.mocked(generateStructuralHash).mockImplementation((s) => `struct-${s}`)
	})

	describe("onPreExecute", () => {
		it("should block mutating tools if no intentId is provided", async () => {
			const context: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "test.ts", content: "const x = 1" },
				intentId: undefined,
			}

			const result = await engine.onPreExecute(context)
			expect(result.allow).toBe(false)
			expect(result.reason).toContain("Gatekeeper Violation")
		})

		it("should allow read-only tools without an intentId", async () => {
			const context: HookContext = {
				task: mockTask,
				toolName: "read_file",
				params: { path: "test.ts" },
				intentId: undefined,
			}

			const result = await engine.onPreExecute(context)
			expect(result.allow).toBe(true)
		})

		it("should block if intentId mismatch occurs", async () => {
			const context: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "test.ts", content: "const x = 1", intent_id: "INT-002" },
				intentId: "INT-001",
			}

			const result = await engine.onPreExecute(context)
			expect(result.allow).toBe(false)
			expect(result.reason).toContain("Intent Mismatch detected")
		})

		it("should block if mutation_class is missing for mutating tools", async () => {
			const context: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "test.ts", content: "const x = 1" },
				intentId: "INT-001",
			}

			const result = await engine.onPreExecute(context)
			expect(result.allow).toBe(false)
			expect(result.reason).toContain("Traceability Requirement")
		})

		it("should block if stale file is detected (Optimistic Locking)", async () => {
			const absolutePath = path.resolve(mockTask.cwd, "stale.ts")

			// Simulate previous read
			vi.mocked(fs.readFile).mockResolvedValueOnce("old content")
			const postContext: HookContext = {
				task: mockTask,
				toolName: "read_file",
				params: { path: "stale.ts" },
				intentId: "INT-001",
			}
			await engine.onPostExecute(postContext, { isError: false })

			// Simulate external change
			vi.mocked(fs.readFile).mockResolvedValueOnce("externally changed content")

			const preContext: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "stale.ts", content: "new content", mutation_class: "EVOLUTION" },
				intentId: "INT-001",
			}

			const result = await engine.onPreExecute(preContext)
			expect(result.allow).toBe(false)
			expect(result.reason).toContain("Stale File Detected")
		})

		it("should block if scope is violated", async () => {
			const intents = {
				intents: [
					{
						id: "INT-001",
						scope: ["src/auth/**"],
					},
				],
			}
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(intents))

			const context: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "src/outside.ts", content: "...", mutation_class: "EVOLUTION" },
				intentId: "INT-001",
			}

			const result = await engine.onPreExecute(context)
			expect(result.allow).toBe(false)
			expect(result.reason).toContain("Scope Violation")
		})

		it("should trip circuit breaker if consecutive mistakes exceed threshold", async () => {
			mockTask.consecutiveMistakeCount = 5
			// Mock scope to pass so circuit breaker can be checked
			const intents = {
				intents: [
					{
						id: "INT-001",
						scope: ["*"],
					},
				],
			}
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(intents))

			const context: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "src/any.ts", content: "...", mutation_class: "EVOLUTION" },
				intentId: "INT-001",
			}

			const result = await engine.onPreExecute(context)
			expect(result.allow).toBe(false)
			expect(result.reason).toContain("Circuit Breaker Triggered")
		})

		it("should detect context rot and block extension", async () => {
			mockTask.clineMessages = new Array(41).fill({})
			// Mock scope to pass
			const intents = {
				intents: [
					{
						id: "INT-001",
						scope: ["*"],
					},
				],
			}
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(intents))

			const context: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "src/any.ts", content: "...", mutation_class: "EVOLUTION" },
				intentId: "INT-001",
			}

			const result = await engine.onPreExecute(context)
			expect(result.allow).toBe(false)
			expect(result.reason).toContain("Context Rot Mitigation")
		})
	})

	describe("onPostExecute", () => {
		it("should classify as AST_REFACTOR if structural hash matches", async () => {
			const absolutePath = path.resolve(mockTask.cwd, "refactor.ts")

			// Initial state
			vi.mocked(fs.readFile).mockResolvedValue("function a() { return 1; }")
			vi.mocked(generateStructuralHash).mockReturnValue("struct-hash-1")

			const preContext: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "refactor.ts", content: "function b() { return 1; }", mutation_class: "EVOLUTION" },
				intentId: "INT-001",
			}

			await engine.onPreExecute(preContext)

			// Simulate write happened
			vi.mocked(fs.readFile).mockResolvedValue("function b() { return 1; }")

			await engine.onPostExecute(preContext, { isError: false })

			// Verify trace log (mock fs.appendFile)
			expect(fs.appendFile).toHaveBeenCalledWith(
				expect.stringContaining("agent_trace.jsonl"),
				expect.stringContaining('"value":"AST_REFACTOR"'),
			)
		})

		it("should classify as EVOLUTION if structural hash changes", async () => {
			const absolutePath = path.resolve(mockTask.cwd, "evolve.ts")

			// Initial state
			vi.mocked(fs.readFile).mockResolvedValue("function a() { return 1; }")
			vi.mocked(generateStructuralHash).mockReturnValueOnce("struct-hash-1") // pre
			vi.mocked(generateStructuralHash).mockReturnValueOnce("struct-hash-2") // post

			const preContext: HookContext = {
				task: mockTask,
				toolName: "write_to_file",
				params: { path: "evolve.ts", content: "function a(x) { return x + 1; }", mutation_class: "EVOLUTION" },
				intentId: "INT-001",
			}

			await engine.onPreExecute(preContext)

			vi.mocked(fs.readFile).mockResolvedValue("function a(x) { return x + 1; }")

			await engine.onPostExecute(preContext, { isError: false })

			expect(fs.appendFile).toHaveBeenCalledWith(
				expect.stringContaining("agent_trace.jsonl"),
				expect.stringContaining('"value":"EVOLUTION"'),
			)
		})
	})
})
