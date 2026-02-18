import { describe, it, expect, vi, beforeEach } from "vitest"
import { spawnSubIntentTool } from "../SpawnSubIntentTool"
import { Task } from "../../task/Task"
import * as fs from "fs/promises"
import * as path from "path"

// Mock dependencies
vi.mock("fs/promises")

describe("SpawnSubIntentTool", () => {
	let mockCline: any
	let mockCallbacks: any
	let pushToolResult: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockCline = {
			cwd: "/test/workspace",
		}

		pushToolResult = vi.fn()
		mockCallbacks = {
			pushToolResult,
		}

		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({
				intents: [{ id: "PARENT-01", status: "active" }],
			}),
		)
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
	})

	it("should successfully spawn a sub-intent", async () => {
		const params = {
			id: "SUB-01",
			parent_id: "PARENT-01",
			description: "A sub-task",
			scope: ["src/*.ts"],
			constraints: ["No external libs"],
			acceptance_criteria: ["Code compiles"],
		}

		await spawnSubIntentTool.execute(params, mockCline as Task, mockCallbacks)

		expect(fs.writeFile).toHaveBeenCalled()
		const call = vi.mocked(fs.writeFile).mock.calls[0]
		const data = JSON.parse(call[1] as string)

		const newIntent = data.intents.find((i: any) => i.id === "SUB-01")
		expect(newIntent).toBeDefined()
		expect(newIntent.parent_id).toBe("PARENT-01")
		expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Success: Spawned sub-intent 'SUB-01'"))
	})

	it("should fail if parent intent does not exist", async () => {
		const params = {
			id: "SUB-01",
			parent_id: "NON-EXISTENT",
			description: "A sub-task",
		}

		await spawnSubIntentTool.execute(params as any, mockCline as Task, mockCallbacks)

		expect(fs.writeFile).not.toHaveBeenCalled()
		expect(pushToolResult).toHaveBeenCalledWith(
			expect.stringContaining("Error: Parent Intent ID 'NON-EXISTENT' not found"),
		)
	})

	it("should fail if sub-intent ID already exists", async () => {
		vi.mocked(fs.readFile).mockResolvedValue(
			JSON.stringify({
				intents: [
					{ id: "PARENT-01", status: "active" },
					{ id: "SUB-01", parent_id: "PARENT-01" },
				],
			}),
		)

		const params = {
			id: "SUB-01",
			parent_id: "PARENT-01",
			description: "A sub-task",
		}

		await spawnSubIntentTool.execute(params as any, mockCline as Task, mockCallbacks)

		expect(fs.writeFile).not.toHaveBeenCalled()
		expect(pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Error: Intent ID 'SUB-01' already exists"))
	})
})
