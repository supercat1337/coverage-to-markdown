// @ts-check

/**
 * Small string and number formatting helpers shared by every renderer.
 */

import { isAbsolute, relative } from 'node:path';

/** @typedef {import('./types.js').Metric} Metric */
/** @typedef {import('./types.js').Totals} Totals */
/** @typedef {import('./types.js').BlockGap} BlockGap */
/** @typedef {import('./types.js').BranchGap} BranchGap */

/** Backtick, kept in a constant so no template literal ever needs escaping. */
export const BT = '`';

/**
 * Wrap a value as an inline code span.
 * @param {unknown} value
 * @returns {string}
 */
export function code(value) {
    return BT + String(value) + BT;
}

/**
 * @param {string} content
 * @returns {string[]} Lines with any trailing carriage return removed.
 */
export function splitLines(content) {
    return content.split('\n').map(line => line.replace(/\r$/, ''));
}

/**
 * Display a path relative to the current working directory with forward
 * slashes, so the document is portable and leaks no local structure.
 * @param {string} absPath
 * @returns {string}
 */
export function toDisplayPath(absPath) {
    const rel = relative(process.cwd(), absPath);
    if (rel === '' || isAbsolute(rel)) {
        return absPath.replace(/\\/g, '/');
    }
    return rel.replace(/\\/g, '/');
}

/**
 * @param {number} covered
 * @param {number} total
 * @returns {number | null} Percentage rounded to one decimal, null when total is 0.
 */
export function percent(covered, total) {
    if (total === 0) {
        return null;
    }
    return Math.round((covered / total) * 1000) / 10;
}

/**
 * @param {number} covered
 * @param {number} total
 * @returns {string} Percentage for display, or an em dash.
 */
export function percentText(covered, total) {
    const value = percent(covered, total);
    return value === null ? '—' : value + ' %';
}

/**
 * @param {string} text
 * @param {number} limit
 * @returns {string} Text cut to `limit` characters with an ellipsis.
 */
export function truncate(text, limit) {
    return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
}

/**
 * @param {Totals} totals
 * @returns {string} One-line metric summary, e.g. `Statements 82/82 · ...`.
 */
export function metricLine(totals) {
    /** @type {[string, Metric][]} */
    const rows = [
        ['Statements', totals.statements],
        ['Branches', totals.branches],
        ['Functions', totals.functions],
    ];
    /** @type {string[]} */
    const parts = [];
    for (const [name, value] of rows) {
        parts.push(
            name +
                ' ' +
                value.covered +
                '/' +
                value.total +
                ' (' +
                percentText(value.covered, value.total) +
                ')'
        );
    }
    return parts.join(' · ');
}

/**
 * @param {BlockGap} gap
 * @returns {string} Heading text such as `lines 176–181`.
 */
export function blockLabel(gap) {
    return gap.start === gap.end ? 'line ' + gap.start : 'lines ' + gap.start + '–' + gap.end;
}

/**
 * @param {BranchGap} gap
 * @returns {string} Heading text such as `line 12:8`.
 */
export function locationLabel(gap) {
    return gap.column === null ? 'line ' + gap.line : 'line ' + gap.line + ', col ' + gap.column;
}
