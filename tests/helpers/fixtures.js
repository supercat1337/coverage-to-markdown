// @ts-check

/**
 * Builders for the hand-made shapes the unit tests need.
 *
 * Before this module every test file carried its own `fileOf`/`fileReport`/
 * `snippetFile`/`arm`/`span`, all describing the same objects with slightly
 * different defaults — so a field added to `FileReport` had to be remembered
 * in four places, and a test could pass because its private builder happened
 * to set a field the production code reads.
 *
 * Every builder returns a complete object. A test overrides only the field it
 * is about; the rest is a fixed, documented default.
 */

/**
 * Inclusive span in istanbul's own shape: 1-based lines, 0-based columns.
 * @param {number} startLine
 * @param {number} startColumn
 * @param {number} endLine
 * @param {number} endColumn
 * @returns {{ start: { line: number, column: number }, end: { line: number, column: number } }}
 */
export function span(startLine, startColumn, endLine, endColumn) {
    return {
        start: { line: startLine, column: startColumn },
        end: { line: endLine, column: endColumn },
    };
}

/**
 * Single-line span — the common case, so `span` is not repeated with the same
 * line number twice.
 * @param {number} line
 * @param {number} startColumn
 * @param {number} endColumn
 * @returns {{ start: { line: number, column: number }, end: { line: number, column: number } }}
 */
export function loc(line, startColumn, endColumn) {
    return span(line, startColumn, line, endColumn);
}

/**
 * One arm of a branch, in the shape `analyzeFile` produces.
 * @param {number} index 1-based arm number.
 * @param {number} line
 * @param {number} startColumn
 * @param {number} endColumn
 * @param {number} hits
 * @returns {import('../../src/json-report/types.js').BranchArm}
 */
export function branchArm(index, line, startColumn, endColumn, hits) {
    return {
        arm: index,
        line,
        column: startColumn,
        endLine: line,
        endColumn,
        hits,
    };
}

/**
 * @param {number} start
 * @param {number} end
 * @param {number} [statements]
 * @returns {import('../../src/json-report/types.js').BlockGap}
 */
export function blockGap(start, end, statements = 1) {
    return { kind: 'block', start, end, statements };
}

/**
 * A `FileReport` with every field present.
 *
 * The default is one file of five lines, 4/5 statements covered, no gaps and
 * no functions — enough for a block gap to fall back to a context window
 * instead of a function cut.
 * @param {Partial<import('../../src/json-report/types.js').FileReport>} [overrides]
 * @returns {import('../../src/json-report/types.js').FileReport}
 */
export function fixtureFile(overrides = {}) {
    return {
        path: '/repo/src/a.js',
        displayPath: 'src/a.js',
        sourceLines: ['l1', 'l2', 'l3', 'l4', 'l5'],
        sha256: 'abcdef123456',
        mtimeMs: null,
        blockLines: new Set(),
        totals: {
            statements: { covered: 4, total: 5 },
            branches: { covered: 1, total: 2 },
            functions: { covered: 1, total: 1 },
        },
        gaps: [],
        reasons: new Map(),
        uncoveredFunctions: [],
        functions: [],
        ...overrides,
    };
}

/**
 * A labeled gap and the file it belongs to, i.e. one entry of `assignLabels`.
 * @param {import('../../src/json-report/types.js').Gap} gap
 * @param {Partial<import('../../src/json-report/types.js').FileReport>} [fileOverrides]
 * @param {string} [label]
 * @returns {import('../../src/json-report/types.js').LabeledGap}
 */
export function fixtureItem(gap, fileOverrides = {}, label = 'G1') {
    return { label, file: fixtureFile(fileOverrides), gap };
}

/**
 * `n` generated source lines, so a test can talk about a 100-line function
 * without spelling it out.
 * @param {number} count
 * @returns {string[]}
 */
export function linesOf(count) {
    return Array.from({ length: count }, (_unused, index) => 'l' + (index + 1));
}
