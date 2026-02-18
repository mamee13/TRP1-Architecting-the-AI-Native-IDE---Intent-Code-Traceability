import * as ts from "typescript"
import * as crypto from "crypto"

/**
 * Generates a structural hash of the code.
 * This hash represents the "logic" or "shape" of the code (Kinds of nodes)
 * while ignoring identifiers, literals, and comments.
 *
 * If two pieces of code have the same structural hash, they are structurally equivalent
 * (e.g., a refactor where only names were changed).
 */
export function generateStructuralHash(code: string): string {
	try {
		const sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true)
		const kinds: number[] = []

		function visit(node: ts.Node) {
			// Record the SyntaxKind of the node
			kinds.push(node.kind)

			// Traverse children
			ts.forEachChild(node, visit)
		}

		visit(sourceFile)

		// Join kinds into a string and hash it
		const signature = kinds.join(",")
		return crypto.createHash("sha256").update(signature).digest("hex")
	} catch (error) {
		console.error("[AST] Failed to generate structural hash:", error)
		// Fallback to a hash that will likely not match anything if parsing fails
		return "ast-error-" + Date.now()
	}
}

/**
 * Compares two code blocks for structural equivalence.
 */
export function isStructurallyEquivalent(oldCode: string, newCode: string): boolean {
	const oldHash = generateStructuralHash(oldCode)
	const newHash = generateStructuralHash(newCode)
	return oldHash === newHash
}
