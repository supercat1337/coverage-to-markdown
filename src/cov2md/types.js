// @ts-check

/**
 * Internal JSDoc types for the cov2md modules.
 *
 * `src/types.d.ts` stays the public contract shipped to consumers; this file
 * exists because a `.js` module cannot import typedefs from a `.d.ts` without
 * extra tooling. Keep the two in sync when the public API changes.
 */

/**
 * Inclusive line range in a source file (1-based).
 * @typedef {{ start: number, end: number }} Range
 */

/**
 * How uncovered lines are marked inside rendered snippets.
 * @typedef {'none' | 'comment' | 'gutter'} HighlightMode
 */

/**
 * Options for `buildMarkdown`.
 * @typedef {object} BuildOptions
 * @property {number} [contextLines] Lines of context before and after each range.
 * @property {string} [title] Top-level heading text.
 * @property {string} [fence] Fence language override.
 * @property {HighlightMode} [highlight] Uncovered marker style.
 * @property {string} [command] Command that reproduces the coverage run.
 */

/**
 * Window of source lines rendered for one range.
 * @typedef {{ start: number, end: number }} SnippetBounds
 */

/**
 * Values of the three required named flags.
 * @typedef {{ ranges: string, input: string, output: string }} RequiredFlags
 */

export {};
