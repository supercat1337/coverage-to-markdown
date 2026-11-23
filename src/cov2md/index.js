/**
 * Public API of the cov2md package entry, re-exported by
 * `src/coverage-to-markdown.js`.
 */

export { detectFenceLanguage, pickFenceLength, EXTENSION_TO_FENCE } from './fences.js';
export { buildMarkdown, splitLines } from './markdown.js';
export { normalizeRanges, parseRanges } from './ranges.js';
export { renderSnippet, VALID_HIGHLIGHTS } from './highlight.js';
