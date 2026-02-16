import * as crypto from "crypto"

/**
 * Generates a SHA-256 hash for the given content.
 * Used for intent-code correlation and optimistic locking.
 */
export function generateHash(content: string): string {
	return crypto.createHash("sha256").update(content).digest("hex")
}

/**
 * Generates a spatial hash for a file at a specific point in time.
 */
export async function getSpatialHash(content: string): Promise<string> {
	return generateHash(content)
}
