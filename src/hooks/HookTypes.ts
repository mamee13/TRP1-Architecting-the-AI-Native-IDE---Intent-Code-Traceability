import { HookContext, HookResponse } from "./HookEngine"

/**
 * Clean Middleware Pattern: IHook
 * Defines the contract for all orchestration hooks.
 */
export interface IHook {
	readonly name: string
	onPreExecute?(context: HookContext): Promise<HookResponse>
	onPostExecute?(context: HookContext, result: any): Promise<void>
}

/**
 * Fail-Safe Hook Registry
 */
export class HookRegistry {
	private hooks: IHook[] = []

	public register(hook: IHook) {
		this.hooks.push(hook)
	}

	public async runPreHooks(context: HookContext): Promise<HookResponse> {
		for (const hook of this.hooks) {
			if (hook.onPreExecute) {
				try {
					const response = await hook.onPreExecute(context)
					if (!response.allow) return response
				} catch (error) {
					console.error(`[HOOK ERROR] ${hook.name}.onPreExecute failed:`, error)
					// Fail-safe: continue if a hook crashes unless it's a critical error
				}
			}
		}
		return { allow: true }
	}

	public async runPostHooks(context: HookContext, result: any): Promise<void> {
		// Run post-hooks in parallel but fire-and-forget to avoid blocking UI
		for (const hook of this.hooks) {
			if (hook.onPostExecute) {
				void (async () => {
					try {
						await hook.onPostExecute!(context, result)
					} catch (error) {
						console.error(`[HOOK ERROR] ${hook.name}.onPostExecute failed:`, error)
					}
				})()
			}
		}
	}
}
