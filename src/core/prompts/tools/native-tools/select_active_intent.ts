import type OpenAI from "openai"

const SELECT_ACTIVE_INTENT_DESCRIPTION = `Select an active intent from the orchestration layer. This MUST be the first tool you call in every session to establish the reasoning context. By selecting an intent, you "checkout" the work and ensure your actions are linked to a specific business goal.

Parameters:
- intent_id: (required) The ID of the intent (e.g., 'INTENT-001') defined in .orchestration/active_intents.json.

Example:
{ "intent_id": "INTENT-001" }`

export default {
	type: "function",
	function: {
		name: "select_active_intent",
		description: SELECT_ACTIVE_INTENT_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				intent_id: {
					type: "string",
					description: "The unique identifier for the intent.",
				},
			},
			required: ["intent_id"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool
