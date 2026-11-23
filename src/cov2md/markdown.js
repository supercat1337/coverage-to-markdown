// @ts-check

/**
 * Building the Markdown document: header, one section per normalised range.
 */

import { detectFenceLanguage, pickFenceLength } from './fences.js';
import { renderSnippet, VALID_HIGHLIGHTS } from './highlight.js';
import { basenameOf } from './paths.js';
import { normalizeRanges } from './ranges.js';

/** @typedef {import('./types.js').Range} Range */
/** @typedef {import('./types.js').BuildOptions} BuildOptions */
/** @typedef {import('./types.js').HighlightMode} HighlightMode */
/** @typedef {import('./types.js').SnippetBounds} SnippetBounds */

export const DEFAULT_CONTEXT_LINES = 2;

/** Backtick, kept in a constant so no template literal ever needs escaping. */
const BT = '`';

/**
 * @param {string} value
 * @returns {string} The value wrapped in single backticks.
 */
function code(value) {
    return BT + value + BT;
}

/**
 * Split file content into lines, dropping any trailing carriage return so
 * that Windows-formatted files render correctly.
 * @param {string} content
 * @returns {string[]}
 */
export function splitLines(content) {
    return content.split('\n').map(line => line.replace(/\r$/, ''));
}

/**
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} contextLines
 * @returns {SnippetBounds}
 */
function snippetBounds(lines, range, contextLines) {
    return {
        start: Math.max(1, range.start - contextLines),
        end: Math.min(lines.length, range.end + contextLines),
    };
}

/**
 * @param {Range} range
 * @returns {string} `line 56` or `lines 111–112`.
 */
function formatRangeLabel(range) {
    if (range.start === range.end) {
        return 'line ' + range.start;
    }
    return 'lines ' + range.start + '–' + range.end;
}

/**
 * Keep a command safe inside a Markdown code span.
 * @param {string} command
 * @returns {string}
 */
function sanitizeCommand(command) {
    return command.replace(/`/g, "'").replace(/\r?\n/g, ' ');
}

/**
 * One `## R<n> · …` section with its fenced snippet.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} contextLines
 * @param {string} fenceLang
 * @param {HighlightMode} highlight
 * @returns {string}
 */
function renderRangeSection(lines, range, contextLines, fenceLang, highlight) {
    const bounds = snippetBounds(lines, range, contextLines);
    const fenceLength = pickFenceLength(lines, bounds.start, bounds.end);
    const fence = BT.repeat(fenceLength);
    const snippet = renderSnippet(lines, range, bounds.start, bounds.end, highlight);

    /** @type {string[]} */
    const block = [fence + fenceLang];
    if (snippet.length > 0) {
        block.push(snippet);
    }
    block.push(fence);

    return block.join('\n');
}

/**
 * Build the Markdown document for all ranges.
 * @param {string} sourcePath Path as it should appear in the document.
 * @param {string[]} lines Source lines, already split.
 * @param {Range[]} ranges Ranges to render; normalised internally.
 * @param {BuildOptions} [options]
 * @returns {string}
 */
export function buildMarkdown(sourcePath, lines, ranges, options = {}) {
    const contextLines = options.contextLines ?? DEFAULT_CONTEXT_LINES;
    if (!Number.isInteger(contextLines) || contextLines < 0) {
        throw new Error('Invalid contextLines: ' + contextLines);
    }

    const highlight = options.highlight ?? 'comment';
    if (!VALID_HIGHLIGHTS.includes(highlight)) {
        throw new Error(
            'Invalid highlight mode: "' +
                highlight +
                '". Expected one of: ' +
                VALID_HIGHLIGHTS.join(', ') +
                '.'
        );
    }

    const normalized = normalizeRanges(ranges);
    const title = options.title ?? 'Coverage: ' + basenameOf(sourcePath);
    const fenceLang = options.fence !== undefined ? options.fence : detectFenceLanguage(sourcePath);

    /** @type {string[]} */
    const header = ['# ' + title, '', 'Source: ' + code(sourcePath)];

    if (typeof options.command === 'string' && options.command.length > 0) {
        header.push('Reproduce: ' + code(sanitizeCommand(options.command)));
    }

    header.push('');

    const count = normalized.length;
    const noun = count === 1 ? 'range' : 'ranges';
    header.push(count + ' ' + noun + ' · one contiguous uncovered block each · sorted by line');
    header.push('Labels R1..RN are assigned per run and may change when lines shift.');

    const sections = normalized.map((range, index) => {
        const block = renderRangeSection(lines, range, contextLines, fenceLang, highlight);
        return '## R' + (index + 1) + ' · ' + formatRangeLabel(range) + '\n\n' + block;
    });

    return [header.join('\n'), ...sections].join('\n\n') + '\n';
}
