// @ts-check

/**
 * Choosing and rendering the code shown for a gap.
 *
 * The snippet is cut to the enclosing function instead of a fixed number of
 * lines: a two-line window answers "where", a whole function answers "what",
 * and "what" is what decides whether the fix is a test or a code change.
 * The enclosing function comes from `fnMap`, so no AST is parsed.
 */

import { detectFenceLanguage } from '../cov2md/fences.js';

import { BT } from './format.js';

/** @typedef {import('./types.js').FileReport} FileReport */
/** @typedef {import('./types.js').FunctionSpan} FunctionSpan */
/** @typedef {import('./types.js').HighlightMode} HighlightMode */
/** @typedef {import('./types.js').LineRange} LineRange */
/** @typedef {import('./types.js').SnippetWindow} SnippetWindow */

const MIN_FENCE_LENGTH = 3;
const MIN_FUNCTION_SPAN = 8;
const JSDOC_CLIMB_LIMIT = 60;

/**
 * Narrowest function containing the line that is still long enough to be
 * useful as context. A one-line arrow says nothing, so it loses to the
 * method around it.
 * @param {FunctionSpan[]} spans
 * @param {number} line
 * @param {number} minSpan
 * @returns {FunctionSpan | null}
 */
export function enclosingFunction(spans, line, minSpan) {
    /** @type {FunctionSpan | null} */
    let best = null;
    let bestLength = Number.POSITIVE_INFINITY;

    for (const span of spans) {
        if (line < span.startLine || line > span.endLine) {
            continue;
        }
        const length = span.endLine - span.startLine + 1;
        if (length < minSpan || length >= bestLength) {
            continue;
        }
        best = span;
        bestLength = length;
    }

    return best;
}

/**
 * Walk up from a function body through its JSDoc block, so the reader sees
 * the documented contract next to the uncovered branch.
 *
 * Heuristic by design, but bounded by the comment itself: the climb starts
 * only when the line above ends with a block-comment terminator, continues
 * only through lines that belong to the comment (empty lines and lines
 * starting with `*`), and stops at the first line that does not. Without that
 * check a stray `*`-less line above the block would be swallowed as code.
 * @param {string[]} sourceLines
 * @param {number} startLine 1-based first line of the body.
 * @param {number} limit Maximum lines to climb.
 * @returns {number} Possibly earlier first line.
 */
export function expandThroughJsdoc(sourceLines, startLine, limit) {
    let cursor = startLine - 1;

    if (cursor < 1) {
        return startLine;
    }
    if (!(sourceLines[cursor - 1] ?? '').trim().endsWith('*/')) {
        return startLine;
    }

    let start = startLine;
    let climbed = 0;

    while (cursor >= 1 && climbed < limit) {
        // Indices descend from the one line 75 already bounds-checked.
        /* c8 ignore next */
        const text = (sourceLines[cursor - 1] ?? '').trim();

        if (text.startsWith('/*')) {
            start = cursor;
            break;
        }

        // `* ...` is a JSDoc continuation line; a blank line can sit inside a
        // `/* ... */` block. Anything else means the comment ended.
        const inComment = text.length === 0 || text.startsWith('*');
        if (!inComment) {
            break;
        }

        start = cursor;
        climbed += 1;
        cursor -= 1;
    }

    return start;
}

/**
 * Choose the lines rendered for one gap: the enclosing function when one is
 * found, otherwise a context window, always capped by `maxLines`.
 * @param {FileReport} file
 * @param {number} startLine First line of the gap.
 * @param {number} endLine Last line of the gap.
 * @param {number} contextLines
 * @param {number} maxLines
 * @returns {SnippetWindow}
 */
export function snippetWindow(file, startLine, endLine, contextLines, maxLines) {
    const sourceLines = file.sourceLines ?? [];
    const total = sourceLines.length;

    if (total === 0) {
        return { from: 1, to: 0, before: null, after: null, fn: null };
    }

    const cap = Math.max(1, maxLines);
    const fn = enclosingFunction(file.functions, startLine, MIN_FUNCTION_SPAN);

    let from;
    let to;
    if (fn) {
        from = expandThroughJsdoc(sourceLines, fn.startLine, JSDOC_CLIMB_LIMIT);
        to = fn.endLine;
    } else {
        from = startLine - contextLines;
        to = endLine + contextLines;
    }

    from = Math.max(1, Math.min(from, total));
    to = Math.max(from, Math.min(to, total));

    const originalFrom = from;
    const originalTo = to;

    if (to - from + 1 > cap) {
        const lead = Math.floor(cap / 3);
        const latest = to - cap + 1;
        const cut = Math.max(from, Math.min(startLine - lead, latest));
        from = cut;
        to = cut + cap - 1;
    }

    /** @type {LineRange | null} */
    const before = from > originalFrom ? { start: originalFrom, end: from - 1 } : null;
    /** @type {LineRange | null} */
    const after = to < originalTo ? { start: to + 1, end: originalTo } : null;

    return { from, to, before, after, fn };
}

/**
 * Longest backtick run inside the snippet, plus one; never below three.
 *
 * A fence one backtick longer than the longest run inside the block cannot be
 * closed early, which matters for Markdown fixtures and shell scripts that
 * print fences as their output.
 * @param {string[]} sourceLines
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function fenceLength(sourceLines, from, to) {
    let maxRun = 0;
    const start = Math.max(0, from - 1);
    const end = Math.min(to, sourceLines.length);

    for (let i = start; i < end; i += 1) {
        /* c8 ignore next -- indices clamped by Math.min(to, sourceLines.length) */
        const runs = (sourceLines[i] ?? '').match(/`+/g);
        if (!runs) {
            continue;
        }
        for (const run of runs) {
            if (run.length > maxRun) {
                maxRun = run.length;
            }
        }
    }

    return Math.max(MIN_FENCE_LENGTH, maxRun + 1);
}

/**
 * Render the body of a snippet, without fences.
 * @param {string[]} sourceLines
 * @param {number} from
 * @param {number} to
 * @param {Map<number, string[]>} reasons
 * @param {HighlightMode} highlight
 * @returns {string}
 */
export function renderSnippet(sourceLines, from, to, reasons, highlight) {
    /** @type {string[]} */
    const parts = [];
    const width = String(to).length;

    for (let n = from; n <= to; n += 1) {
        const text = sourceLines[n - 1] ?? '';
        const reasonList = reasons.get(n) ?? [];
        const reason = reasonList.length > 0 ? ' ← ' + reasonList.join(' · ') : '';
        const uncovered = reasonList.length > 0;

        if (highlight === 'gutter') {
            const prefix = uncovered ? '> ' : '  ';
            parts.push(prefix + String(n).padStart(width, ' ') + ' │ ' + text + reason);
        } else if (highlight === 'none') {
            parts.push(text + ' // ' + n);
        } else {
            parts.push(text + ' // ' + n + reason);
        }
    }

    return parts.join('\n');
}

/**
 * One contiguous piece of a window: optional "omitted above" note, the fenced
 * body, optional "omitted below" note.
 *
 * Kept separate from `renderOneWindow` so that a window split by holes can
 * print several pieces without recursing into itself. The previous version
 * called `renderOneWindow` from inside `renderOneWindow`, which is an
 * unconditional stack overflow for every snippet.
 * @param {FileReport} file
 * @param {SnippetWindow} win
 * @param {HighlightMode} highlight
 * @returns {string[]} Lines of the block, or an empty array when the source
 * is unavailable.
 */
function renderSpan(file, win, highlight) {
    const sourceLines = file.sourceLines;
    if (sourceLines === null) {
        return [];
    }

    /** @type {string[]} */
    const lines = [];

    if (win.before !== null) {
        lines.push('> Lines ' + win.before.start + '–' + win.before.end + ' omitted above.', '');
    }

    if (win.from <= win.to) {
        const fence = BT.repeat(fenceLength(sourceLines, win.from, win.to));
        lines.push(
            fence + detectFenceLanguage(file.path),
            renderSnippet(sourceLines, win.from, win.to, file.reasons, highlight),
            fence,
            ''
        );
    }

    if (win.after !== null) {
        lines.push('> Lines ' + win.after.start + '–' + win.after.end + ' omitted below.', '');
    }

    return lines;
}

/**
 * A window, split around the ranges that hold no gap.
 *
 * A long function with two gaps used to be printed as two overlapping excerpts;
 * now it is printed once, with the dead middle cut out. The note between pieces
 * is the same `Lines a–b omitted` the edges already use.
 * @param {FileReport} file
 * @param {SnippetWindow} win
 * @param {HighlightMode} highlight
 * @param {LineRange[]} [holes]
 * @returns {string[]}
 */
export function renderOneWindow(file, win, highlight, holes = []) {
    if (holes.length === 0) {
        return renderSpan(file, win, highlight);
    }

    /** @type {string[]} */
    const lines = [];
    let cursor = win.from;

    for (const hole of holes) {
        if (hole.start > cursor) {
            lines.push(
                ...renderSpan(
                    file,
                    { ...win, from: cursor, to: hole.start - 1, before: null, after: null },
                    highlight
                )
            );
        }
        lines.push('> Lines ' + hole.start + '–' + hole.end + ' omitted', '');
        cursor = hole.end + 1;
    }

    if (cursor <= win.to) {
        lines.push(
            ...renderSpan(
                file,
                { ...win, from: cursor, to: win.to, before: null, after: null },
                highlight
            )
        );
    }

    return lines;
}

/**
 * A fenced snippet for one window. Thin alias of `renderOneWindow`, kept
 * because the renderer calls it by this name and because the two arguments
 * differ (a window object instead of a line pair).
 * @param {FileReport} file
 * @param {SnippetWindow} win
 * @param {HighlightMode} highlight
 * @param {LineRange[]} [holes]
 * @returns {string[]}
 */
export function renderWindowBlock(file, win, highlight, holes = []) {
    return renderOneWindow(file, win, highlight, holes);
}

/**
 * A fenced snippet for one gap, with explicit markers for cut lines.
 * @param {FileReport} file
 * @param {number} startLine
 * @param {number} endLine
 * @param {number} contextLines
 * @param {number} maxLines
 * @param {HighlightMode} highlight
 * @returns {string[]} Lines of the block, or an empty array when the source
 * is unavailable.
 */
export function snippetBlock(file, startLine, endLine, contextLines, maxLines, highlight) {
    return renderWindowBlock(
        file,
        snippetWindow(file, startLine, endLine, contextLines, maxLines),
        highlight
    );
}
