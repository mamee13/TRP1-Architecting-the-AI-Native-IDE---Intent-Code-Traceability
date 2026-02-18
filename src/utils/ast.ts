import * as ts from "typescript"
import * as crypto from "crypto"
import * as path from "path"

// Cache for SourceFiles to avoid re-parsing the same content in the same tick or near-simultaneously
const sourceFileCache = new Map<string, { content: string; sourceFile: ts.SourceFile; timestamp: number }>()
const CACHE_TTL_MS = 1000 // 1 second cache

/**
 * Non-structural node kinds that should NOT affect the structural hash.
 * These represent comments, whitespace, and other trivia that don't change
 * the logical shape of the code.
 */
const NON_STRUCTURAL_KINDS = new Set([
	ts.SyntaxKind.SingleLineCommentTrivia,
	ts.SyntaxKind.MultiLineCommentTrivia,
	ts.SyntaxKind.NewLineTrivia,
	ts.SyntaxKind.WhitespaceTrivia,
	ts.SyntaxKind.ShebangTrivia,
	ts.SyntaxKind.ConflictMarkerTrivia,
	ts.SyntaxKind.JSDocComment,
	ts.SyntaxKind.JSDocText,
	ts.SyntaxKind.JSDocLink,
	ts.SyntaxKind.JSDocLinkCode,
	ts.SyntaxKind.JSDocLinkPlain,
])

/**
 * Generates a structural hash of the code.
 * This hash represents the "logic" or "shape" of the code (Kinds of nodes)
 * while ignoring identifiers, literals, comments, and whitespace.
 */
export function generateStructuralHash(code: string, filePath?: string): string {
	try {
		let sourceFile: ts.SourceFile
		const absolutePath = filePath ? path.resolve(filePath) : undefined

		// Check cache if we have a path
		if (absolutePath) {
			const cached = sourceFileCache.get(absolutePath)
			if (cached && cached.content === code && Date.now() - cached.timestamp < CACHE_TTL_MS) {
				sourceFile = cached.sourceFile
			} else {
				sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true)
				sourceFileCache.set(absolutePath, { content: code, sourceFile, timestamp: Date.now() })
			}
		} else {
			sourceFile = ts.createSourceFile("temp.ts", code, ts.ScriptTarget.Latest, true)
		}

		// Use a fixed-size buffer for common file sizes to avoid overhead
		// Each SyntaxKind is a number. We can store them as 2-byte integers.
		// A typical file might have a few thousand nodes.
		const MAX_NODES = 10000
		const buffer = Buffer.allocUnsafe(MAX_NODES * 2)
		let offset = 0

		function visit(node: ts.Node) {
			// Skip non-structural nodes (comments, whitespace, JSDoc)
			// so that comment-only changes don't affect the structural hash
			if (!NON_STRUCTURAL_KINDS.has(node.kind) && offset < buffer.length - 2) {
				buffer.writeUInt16LE(node.kind, offset)
				offset += 2
			}
			ts.forEachChild(node, visit)
		}

		visit(sourceFile)

		return crypto.createHash("sha256").update(buffer.subarray(0, offset)).digest("hex")
	} catch (error) {
		console.error("[AST] Failed to generate structural hash:", error)
		return "ast-error-" + Date.now()
	}
}

/**
 * Compares two code blocks for structural equivalence.
 */
export function isStructurallyEquivalent(oldCode: string, newCode: string, filePath?: string): boolean {
	const oldHash = generateStructuralHash(oldCode, filePath)
	const newHash = generateStructuralHash(newCode, filePath)
	return oldHash === newHash
}
