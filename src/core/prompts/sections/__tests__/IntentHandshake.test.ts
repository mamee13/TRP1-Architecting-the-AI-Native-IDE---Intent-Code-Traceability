import { describe, it, expect, vi, beforeEach } from "vitest"
import { getIntentContextSection } from "../intent-context"
import * as fs from "fs/promises"
import * as path from "path"

// Mock dependencies
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	readdir: vi.fn(),
	stat: vi.fn(),
}))

describe("Intent Handshake Integration", () => {
	const cwd = "/test/workspace"

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("getIntentContextSection", () => {
		it("should return Exploration Mode note if no activeIntentId", async () => {
			const result = await getIntentContextSection(cwd, undefined)
			expect(result).toContain("No Active Intent Selected")
			expect(result).toContain("Exploration Mode")
		})

		it("should inject intent details and traces when intent is active", async () => {
			const intents = `
active_intents:
  - id: "INT-001"
    description: "Test Intent"
    owned_scope:
      - "src/*"
    status: "active"
`
			const traces = [
				JSON.stringify({
					timestamp: "2024-01-01T00:00:00Z",
					files: [
						{
							relative_path: "src/main.ts",
							conversations: [
								{
									related: [
										{ type: "specification", value: "INT-001" },
										{ type: "mutation_class", value: "EVOLUTION" },
									],
									ranges: [{ content_hash: "sha256:hash-1234567" }],
								},
							],
						},
					],
					toolName: "write_to_file",
				}),
				JSON.stringify({
					timestamp: "2024-01-01T00:01:00Z",
					files: [
						{
							relative_path: "src/utils.ts",
							conversations: [
								{
									related: [
										{ type: "specification", value: "INT-001" },
										{ type: "mutation_class", value: "REFACTOR" },
									],
									ranges: [{ content_hash: "sha256:hash-890abcd" }],
								},
							],
						},
					],
					toolName: "apply_diff",
				}),
			].join("\n")

			// Mock reading intents and traces
			vi.mocked(fs.readFile).mockImplementation((p: any) => {
				const filePath = p.toString()
				if (filePath.endsWith("active_intents.yaml")) return Promise.resolve(intents)
				if (filePath.endsWith("agent_trace.jsonl")) return Promise.resolve(traces)
				return Promise.resolve("")
			})

			const result = await getIntentContextSection(cwd, "INT-001")

			expect(result).toContain("<intent_context>")
			expect(result).toContain("INT-001")
			expect(result).toContain("Test Intent")
			expect(result).toContain("src/main.ts")
			expect(result).toContain("src/utils.ts")
			expect(result).toContain("[EVOLUTION]")
			expect(result).toContain("[REFACTOR]")
		})
	})
})
