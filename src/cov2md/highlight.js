// @ts-check

/**
 * Rendering the code of one range in one of three marker styles.
 *
 * `comment` keeps every line copy-pasteable, `gutter` reads like a diff but is
 * no longer pasteable, `none` is the legacy format for downstream parsers.
 */

/** @typedef {import('./types.js').Range} Range */
/** @typedef {import('./types.js').HighlightMode} HighlightMode */

/** @type {HighlightMode[]} */
export const VALID_HIGHLIGHTS = ['none', 'comment', 'gutter'];

/**
 * Legacy format: every line gets a line-number comment, no marker.
 * @param {string[]} lines
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @returns {string}
 */
export function renderSnippetNone(lines, snippetStart, snippetEnd) {
    /** @type {string[]} */
    const parts = [];

    for (let n = snippetStart; n <= snippetEnd; n += 1) {
        parts.push((lines[n - 1] ?? '') + ' // ' + n);
    }

    return parts.join('\n');
}

/**
 * Context lines get a line-number comment, uncovered lines get a marker.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @returns {string}
 */
export function renderSnippetComment(lines, range, snippetStart, snippetEnd) {
    /** @type {string[]} */
    const parts = [];

    for (let n = snippetStart; n <= snippetEnd; n += 1) {
        const isUncovered = n >= range.start && n <= range.end;
        const marker = isUncovered ? ' ← UNCOVERED' : '';
        parts.push((lines[n - 1] ?? '') + ' // ' + n + marker);
    }

    return parts.join('\n');
}

/**
 * Line number on the left with a box-drawing separator, `>` for uncovered
 * lines, right-aligned to the width of the largest number in the snippet.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @returns {string}
 */
export function renderSnippetGutter(lines, range, snippetStart, snippetEnd) {
    const width = String(snippetEnd).length;
    /** @type {string[]} */
    const parts = [];

    for (let n = snippetStart; n <= snippetEnd; n += 1) {
        const isUncovered = n >= range.start && n <= range.end;
        const prefix = isUncovered ? '> ' : '  ';
        const padded = String(n).padStart(width, ' ');
        parts.push(prefix + padded + ' │ ' + (lines[n - 1] ?? ''));
    }

    return parts.join('\n');
}

/**
 * Dispatch to the renderer that matches the requested mode.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @param {HighlightMode} highlight
 * @returns {string}
 */
export function renderSnippet(lines, range, snippetStart, snippetEnd, highlight) {
    if (highlight === 'gutter') {
        return renderSnippetGutter(lines, range, snippetStart, snippetEnd);
    }
    if (highlight === 'none') {
        return renderSnippetNone(lines, snippetStart, snippetEnd);
    }
    return renderSnippetComment(lines, range, snippetStart, snippetEnd);
}
