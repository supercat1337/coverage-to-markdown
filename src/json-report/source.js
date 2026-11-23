/**
 * Reading source files and slicing text out of them.
 *
 * The coverage report may carry absolute paths, file URLs, or paths
 * produced on another machine, so reading is best-effort: a missing file
 * must not fail the run, it only removes snippets.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { splitLines } from './format.js';

/**
 * Load a source file and hash its content.
 * @param {string} filePath
 * @returns {{ lines: string[], sha256: string, mtimeMs: number } | null}
 */
export function loadSource(filePath) {
    /** @type {string[]} */
    const candidates = [filePath];

    if (filePath.startsWith('file://')) {
        try {
            candidates.unshift(fileURLToPath(filePath));
        } catch {
            /* not a real file URL — ignore */
        }
    }

    for (const candidate of candidates) {
        try {
            const stats = statSync(candidate);
            if (!stats.isFile()) {
                continue;
            }
            const content = readFileSync(candidate, 'utf8');
            return {
                lines: splitLines(content),
                sha256: createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12),
                mtimeMs: stats.mtimeMs,
            };
        } catch {
            /* unreadable candidate — try the next one */
        }
    }

    return null;
}

/**
 * Slice source text between two positions. Lines are 1-based, columns are
 * 0-based, matching istanbul.
 * @param {string[]} lines
 * @param {number} fromLine
 * @param {number} fromColumn
 * @param {number} toLine
 * @param {number} toColumn
 * @returns {string}
 */
export function sliceSource(lines, fromLine, fromColumn, toLine, toColumn) {
    // A negative column means "unknown" in some v8-to-istanbul reports.
    // `String.prototype.slice` treats it as "from the end", so an arm could
    // read as the last two characters of a line (`h;`). Treat it as 0.
    const from = Math.max(0, fromColumn);
    const to = Math.max(0, toColumn);

    if (fromLine === toLine) {
        return (lines[fromLine - 1] ?? '').slice(from, to);
    }

    /** @type {string[]} */
    const parts = [(lines[fromLine - 1] ?? '').slice(from)];
    for (let n = fromLine + 1; n < toLine; n += 1) {
        parts.push(lines[n - 1] ?? '');
    }
    parts.push((lines[toLine - 1] ?? '').slice(0, to));
    return parts.join('\n');
}

/**
 * Recognise the operator that sits between two branch arms. istanbul does
 * not store the operator, but it stores the end of one arm and the start
 * of the next, so the text between them is the operator with comments and
 * whitespace still attached.
 * @param {string} text
 * @returns {string | null} The operator, or null when the gap is not one.
 */
export function matchOperator(text) {
    const cleaned = text
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ')
        .trim();

    if (cleaned.length === 0 || cleaned.length > 12) {
        return null;
    }

    const pattern =
        /^(=>|\?\?|\?\.|&&|\|\||===|!==|==|!=|<=|>=|\?|:|\+|-|\*|\/|%|<|>|instanceof|in|&|\||\^)$/;
    return pattern.test(cleaned) ? cleaned : null;
}
