import * as path from "path"
import * as fs from "fs/promises"
import { Task } from "../core/task/Task"
import { ToolName } from "@roo-code/types"
import { HookRegistry } from "./HookTypes"
import { GovernanceHook } from "./GovernanceHook"
import { TraceabilityHook } from "./TraceabilityHook"
import { OptimisticLockHook } from "./OptimisticLockHook"
import { ScopeEnforcementHook } from "./ScopeEnforcementHook"

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

/**
 * HookEngine: Central Dispatcher (Clean Middleware Pattern)
 */
export class HookEngine {
	private static instance: HookEngine
	private registry: HookRegistry = new HookRegistry()

	// Shared State managed by HookEngine but used by hooks
	private lastReadHashes: Map<string, string> = new Map()
	private lastStructuralHashes: Map<string, string> = new Map()
	private stateFilePath: string | null = null

	private constructor() {
		// Register Middleware (Phase 8 Rubric Alignment)
		this.registry.register(new GovernanceHook())
		this.registry.register(new OptimisticLockHook())
		this.registry.register(new ScopeEnforcementHook())
		this.registry.register(new TraceabilityHook())
	}

	public static getInstance(): HookEngine {
		if (!HookEngine.instance) {
			HookEngine.instance = new HookEngine()
		}
		return HookEngine.instance
	}

	/**
	 * Shared State Accessors
	 */
	public getLastReadHash(path: string): string | undefined {
		return this.lastReadHashes.get(path)
	}
	public setLastReadHash(path: string, hash: string) {
		this.lastReadHashes.set(path, hash)
	}
	public getLastStructuralHash(path: string): string | undefined {
		return this.lastStructuralHashes.get(path)
	}
	public setLastStructuralHash(path: string, hash: string) {
		this.lastStructuralHashes.set(path, hash)
	}

	public async loadState(cwd: string): Promise<void> {
		this.stateFilePath = path.join(cwd, ".orchestration", "hook_state.json")
		try {
			const raw = await fs.readFile(this.stateFilePath, "utf-8")
			const state = JSON.parse(raw)
			if (state.readHashes) this.lastReadHashes = new Map(Object.entries(state.readHashes))
			if (state.structuralHashes) this.lastStructuralHashes = new Map(Object.entries(state.structuralHashes))
			console.log(`[ORCHESTRATION] Persistent state restored.`)
		} catch {
			/* Fresh start */
		}
	}

	public async persistState(): Promise<void> {
		if (!this.stateFilePath) return
		try {
			const state = {
				readHashes: Object.fromEntries(this.lastReadHashes),
				structuralHashes: Object.fromEntries(this.lastStructuralHashes),
				updatedAt: new Date().toISOString(),
			}
			await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), "utf-8")
		} catch (e) {
			console.warn("[ORCHESTRATION] State persistence failed", e)
		}
	}

	public async onPreExecute(context: HookContext): Promise<HookResponse> {
		return this.registry.runPreHooks(context)
	}

	public async onPostExecute(context: HookContext, result: any): Promise<void> {
		return this.registry.runPostHooks(context, result)
	}
}
