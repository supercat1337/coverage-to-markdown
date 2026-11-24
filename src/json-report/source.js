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

/**
 * Blank out string and comment content so brace counting sees only code.
 *
 * A heuristic, not a lexer: regex literals and nested template expressions are
 * not understood. For finding the block that encloses a line it is enough — a
 * stray `}` inside a template literal would need `\`` nesting to fool it, and
 * that shape does not appear in the files this tool is pointed at.
 * @param {string} text
 * @returns {string}
 */
export function stripStringsAndComments(text) {
    let out = '';
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '/' && text[i + 1] === '/') {
            break;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            const quote = ch;
            i += 1;
            while (i < text.length && text[i] !== quote) {
                if (text[i] === '\\') {
                    i += 1;
                }
                i += 1;
            }
            out += ' ';
            continue;
        }
        out += ch;
    }
    return out;
}

/**
 * The first string literal worth quoting from a range of lines.
 *
 * Why this exists: an uncovered block is usually an error path, and the error
 * path's whole identity is its message. `'cache.init failed'` tells the reader
 * what the code does and what to grep for in `tests/`; `lines 624–626` tells
 * them only where to look. Literals shorter than four characters are skipped
 * because `'a'`, `''` and `'\n'` carry no meaning to a human.
 * @param {string[]} lines
 * @param {number} from 1-based, inclusive.
 * @param {number} to 1-based, inclusive.
 * @returns {string | null}
 */
export function firstLiteral(lines, from, to) {
    // `slice`, not indexing: an index needs `?? ''` for a line that might be
    // past the end, and that guard is a branch no test can reach once the range
    // is clamped. A slice is clamped once, and the loop body then holds a value
    // the compiler already knows is a string.
    for (const raw of lines.slice(from - 1, to)) {
        const text = raw.replace(/\/\/.*$/, '');
        const match = /'((?:[^'\\\n]|\\.){4,})'|"((?:[^"\\\n]|\\.){4,})"/.exec(text);
        if (match !== null) {
            // Exactly one group is set: the two alternatives are mutually
            // exclusive. `?? null` satisfies the return type only.
            /* c8 ignore next */
            return match[1] ?? match[2] ?? null;
        }
    }
    return null;
}

/**
 * Whether the block that encloses a line is a `catch` or a `finally`.
 *
 * The distinction the reader actually needs: a missing arm in a `catch` is
 * either a test that has not been written or a contract that makes it
 * unreachable — "add a negative test" or "c8 ignore next" — and those are
 * different actions. Everywhere else the same gap means "somebody forgot a
 * branch". Roughly four in ten gaps in real code are this case.
 *
 * Walks upwards counting braces, so a `}` in a nested block does not stop it.
 * Returns `null` for every other block, including `try`: the body of a `try`
 * that never ran is not a decision the reader has to make.
 * @param {string[]} lines
 * @param {number} from 1-based line inside the block.
 * @returns {'catch' | 'finally' | null}
 */
export function enclosingClause(lines, from) {
    let depth = 0;
    for (let n = from; n >= 1; n -= 1) {
        const text = stripStringsAndComments(lines[n - 1] ?? '');
        for (let i = text.length - 1; i >= 0; i -= 1) {
            const ch = text[i];
            if (ch === '}') {
                depth += 1;
            } else if (ch === '{') {
                if (depth === 0) {
                    return clauseKind(text.slice(0, i));
                }
                depth -= 1;
            }
        }
    }
    return null;
}

/**
 * The keyword in front of the `{` that opened the block.
 *
 * Only `catch` and `finally` are named. In this syntax the `{` of a block sits
 * on the same line as its keyword, so `head` — the text before the brace on
 * that line — is enough. A lone `{` on its own line (Allman style) is not
 * recognised, and that is deliberate: telling the two apart needs a second
 * lookup upwards and four more tests for a layout the tool is never pointed at.
 * @param {string} head
 * @returns {'catch' | 'finally' | null}
 */
function clauseKind(head) {
    if (/\bcatch\s*[({]/.test(head)) {
        return 'catch';
    }
    if (/\bfinally\b/.test(head)) {
        return 'finally';
    }
    return null;
}
