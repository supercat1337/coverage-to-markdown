// @ts-check

/**
 * Unit tests for the analysis core of `covgaps`: formatting helpers, reading
 * and analysing an istanbul entry, slicing source text, and turning branch
 * arms into prose.
 *
 * Every fixture here is written by hand instead of copied from a real c8 run,
 * so a failure points at the rule that broke rather than at a changed c8
 * version.
 */

import test from 'ava';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    CLI_OPTIONS,
    DEFAULT_CONTEXT,
    DEFAULT_MAX_LINES,
    DEFAULT_OUTPUT,
    DEFAULT_REPORT,
    VALID_SORTS,
    parseContextOption,
    parseHighlightOption,
    parseMaxLinesOption,
    parseSortOption,
} from '../src/json-report/args.js';
import { armDescriptors, isPhantomLine } from '../src/json-report/branches.js';
import {
    BT,
    blockLabel,
    code,
    locationLabel,
    metricLine,
    percent,
    percentText,
    splitLines,
    toDisplayPath,
    truncate,
} from '../src/json-report/format.js';
import {
    analyzeFile,
    collectFunctionSpans,
    mergeLineRanges,
    readReport,
} from '../src/json-report/istanbul.js';

import { loadSource, matchOperator, sliceSource } from '../src/json-report/source.js';
import { tmpDir, writeFile } from './_helpers.js';
import { span } from './helpers/fixtures.js';

// --- format -------------------------------------------------------------

test('BT is a single backtick', t => {
    t.is(BT, '`');
});

test('code wraps a value as an inline code span', t => {
    t.is(code('src/a.js'), '`src/a.js`');
    t.is(code(5), '`5`');
});

test('splitLines strips trailing carriage returns', t => {
    t.deepEqual(splitLines('a\r\nb\nc'), ['a', 'b', 'c']);
});

test('percent rounds to one decimal', t => {
    t.is(percent(1, 3), 33.3);
    t.is(percent(2, 3), 66.7);
    t.is(percent(3, 3), 100);
    t.is(percent(0, 3), 0);
});

test('percent returns null when there is nothing to measure', t => {
    t.is(percent(0, 0), null);
});

test('percentText prints a percentage or an em dash', t => {
    t.is(percentText(1, 4), '25 %');
    t.is(percentText(0, 0), '—');
});

test('truncate leaves short text alone and cuts long text with an ellipsis', t => {
    t.is(truncate('abcde', 5), 'abcde');
    t.is(truncate('abcdef', 5), 'abcd…');
    t.is(truncate('abcdef', 5).length, 5);
});

test('metricLine renders the three counters on one line', t => {
    t.is(
        metricLine({
            statements: { covered: 1, total: 2 },
            branches: { covered: 0, total: 0 },
            functions: { covered: 1, total: 1 },
        }),
        'Statements 1/2 (50 %) · Branches 0/0 (—) · Functions 1/1 (100 %)'
    );
});

test('blockLabel switches between line and lines', t => {
    t.is(blockLabel({ kind: 'block', start: 5, end: 5, statements: 1 }), 'line 5');
    t.is(blockLabel({ kind: 'block', start: 176, end: 181, statements: 4 }), 'lines 176–181');
});

test('locationLabel appends the column only when it is known', t => {
    t.is(locationLabel({ line: 12, column: 8 }), 'line 12, col 8');
    t.is(locationLabel({ line: 12, column: null }), 'line 12');
    t.is(locationLabel({ line: 12, column: 0 }), 'line 12, col 0');
});

// --- istanbul: mergeLineRanges -----------------------------------------

test('mergeLineRanges sorts and joins overlapping and adjacent ranges', t => {
    t.deepEqual(
        mergeLineRanges([
            { start: 5, end: 7 },
            { start: 8, end: 10 },
            { start: 20, end: 21 },
            { start: 3, end: 5 },
        ]),
        [
            { start: 3, end: 10 },
            { start: 20, end: 21 },
        ]
    );
});

test('mergeLineRanges keeps a one-line hole between ranges', t => {
    t.deepEqual(
        mergeLineRanges([
            { start: 1, end: 2 },
            { start: 4, end: 5 },
        ]),
        [
            { start: 1, end: 2 },
            { start: 4, end: 5 },
        ]
    );
});

test('mergeLineRanges returns an empty array for empty input', t => {
    t.deepEqual(mergeLineRanges([]), []);
});

test('mergeLineRanges does not mutate its input', t => {
    const input = [
        { start: 5, end: 6 },
        { start: 1, end: 5 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    mergeLineRanges(input);
    t.deepEqual(input, snapshot);
});

// --- istanbul: collectFunctionSpans ------------------------------------

test('collectFunctionSpans reads the body from loc and falls back to decl', t => {
    const spans = collectFunctionSpans({
        0: { name: 'b', decl: span(10, 0, 10, 5), loc: span(10, 0, 14, 1) },
        1: { name: '', loc: span(1, 0, 3, 1) },
        2: { name: 'noLoc', decl: span(20, 0, 20, 5) },
        3: { name: 'broken' },
    });

    t.deepEqual(spans, [
        { name: '(anonymous)', startLine: 1, endLine: 3, declLine: 1 },
        { name: 'b', startLine: 10, endLine: 14, declLine: 10 },
        { name: 'noLoc', startLine: 20, endLine: 20, declLine: 20 },
    ]);
});

test('collectFunctionSpans tolerates a null entry', t => {
    t.deepEqual(
        collectFunctionSpans({
            0: /** @type {any} */ (null),
            1: { name: 'ok', loc: span(2, 0, 4, 1) },
        }),
        [{ name: 'ok', startLine: 2, endLine: 4, declLine: 2 }]
    );
});

test('collectFunctionSpans sorts by start line, longest first on a tie', t => {
    const spans = collectFunctionSpans({
        0: { name: 'sameStartShort', loc: span(5, 0, 6, 1) },
        1: { name: 'sameStartLong', loc: span(5, 0, 30, 1) },
    });

    t.deepEqual(
        spans.map(item => item.name),
        ['sameStartLong', 'sameStartShort']
    );
});

// --- istanbul: analyzeFile ---------------------------------------------

const ENTRY = {
    statementMap: {
        0: span(1, 0, 1, 20),
        1: span(2, 0, 2, 20),
        2: span(3, 0, 3, 20),
        3: span(9, 0, 9, 20),
    },
    s: { 0: 5, 1: 0, 2: 0, 3: 0 },
    fnMap: {
        0: { name: 'covered', decl: span(1, 0, 1, 10), loc: span(1, 0, 4, 1) },
        1: { name: 'never', decl: span(9, 0, 9, 10), loc: span(9, 0, 10, 1) },
    },
    f: { 0: 2, 1: 0 },
    branchMap: {
        0: { type: 'if', line: 6, locations: [span(6, 4, 6, 10), span(6, 20, 6, 30)] },
    },
    b: { 0: [1, 0] },
};

test('analyzeFile splits uncovered statements into contiguous blocks', t => {
    const analysis = analyzeFile('/repo/src/a.js', ENTRY);

    t.deepEqual(analysis.totals, {
        statements: { covered: 1, total: 4 },
        branches: { covered: 1, total: 2 },
        functions: { covered: 1, total: 2 },
    });
});

test('analyzeFile lists blocks and branches in source order', t => {
    const analysis = analyzeFile('/repo/src/a.js', ENTRY);

    t.deepEqual(analysis.gaps, [
        { kind: 'block', start: 2, end: 3, statements: 2 },
        {
            kind: 'branch',
            type: 'if',
            line: 6,
            column: 4,
            arms: [
                { arm: 1, line: 6, column: 4, endLine: 6, endColumn: 10, hits: 1 },
                { arm: 2, line: 6, column: 20, endLine: 6, endColumn: 30, hits: 0 },
            ],
            missingArms: [2],
        },
        { kind: 'block', start: 9, end: 9, statements: 1 },
    ]);
});

test('analyzeFile records a per-line reason for every uncovered line', t => {
    const analysis = analyzeFile('/repo/src/a.js', ENTRY);

    t.is(analysis.reasons.size, 4);
    t.deepEqual(analysis.reasons.get(2), ['UNCOVERED']);
    t.deepEqual(analysis.reasons.get(3), ['UNCOVERED']);
    t.deepEqual(analysis.reasons.get(9), ['UNCOVERED']);
    t.deepEqual(analysis.reasons.get(6), ['BRANCH 2/2']);
});

test('analyzeFile names the functions that never ran', t => {
    const analysis = analyzeFile('/repo/src/a.js', ENTRY);

    t.deepEqual(analysis.uncoveredFunctions, [{ name: 'never', line: 9 }]);
    t.deepEqual(
        analysis.functions.map(item => item.name),
        ['covered', 'never']
    );
});

test('analyzeFile reports no gap for a fully covered branch', t => {
    const analysis = analyzeFile('/repo/src/a.js', {
        statementMap: { 0: span(1, 0, 1, 10) },
        s: { 0: 1 },
        branchMap: {
            0: { type: 'if', line: 3, locations: [span(3, 0, 3, 4), span(3, 8, 3, 12)] },
        },
        b: { 0: [1, 1] },
    });

    t.deepEqual(analysis.gaps, []);
    t.deepEqual(analysis.totals.branches, { covered: 2, total: 2 });
});

test('analyzeFile falls back to the first arm line when meta.line is absent', t => {
    const analysis = analyzeFile('/repo/src/a.js', {
        branchMap: {
            0: { type: 'switch', locations: [span(7, 2, 7, 8), span(9, 2, 9, 8)] },
        },
        b: { 0: [0, 3] },
    });

    t.is(analysis.gaps.length, 1);
    const gap = /** @type {any} */ (analysis.gaps[0]);
    t.is(gap.line, 7);
    t.deepEqual(gap.missingArms, [1]);
});

test('analyzeFile skips a branch whose arms have no locations', t => {
    const analysis = analyzeFile('/repo/src/a.js', {
        branchMap: { 0: { type: 'branch', locations: [] } },
        b: { 0: [] },
    });

    t.deepEqual(analysis.gaps, []);
    t.deepEqual(analysis.totals.branches, { covered: 0, total: 0 });
});

test('analyzeFile handles an empty entry', t => {
    const analysis = analyzeFile('/repo/src/a.js', {});

    t.deepEqual(analysis.gaps, []);
    t.deepEqual(analysis.totals, {
        statements: { covered: 0, total: 0 },
        branches: { covered: 0, total: 0 },
        functions: { covered: 0, total: 0 },
    });
    t.is(analysis.reasons.size, 0);
});

test('analyzeFile rejects a non-object entry', t => {
    t.throws(() => analyzeFile('/repo/src/a.js', /** @type {any} */ (null)), {
        message: /Coverage entry for \/repo\/src\/a\.js is not an object/,
    });
});

// --- istanbul: readReport ----------------------------------------------

test('readReport parses a valid report', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'coverage/coverage-final.json', '{"a.js":{"s":{"0":1}}}');

    const report = readReport(path);
    t.deepEqual(Object.keys(report), ['a.js']);
});

test('readReport reports a missing file', t => {
    const dir = tmpDir(t);
    t.throws(() => readReport(join(dir, 'nope.json')), {
        message: /Cannot read coverage report/,
    });
});

test('readReport reports invalid JSON with the parser message', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'bad.json', '{ nope');
    t.throws(() => readReport(path), { message: /not valid JSON/ });
});

test('readReport rejects a JSON array', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'array.json', '[]');
    t.throws(() => readReport(path), { message: /must be an object mapping file paths/ });
});

test('readReport rejects null', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'null.json', 'null');
    t.throws(() => readReport(path), { message: /must be an object mapping file paths/ });
});

// --- source: sliceSource ----------------------------------------------

const SOURCE = ['0123456789', 'abcdefghij', 'ABCDEFGHIJ'];

test('sliceSource cuts inside one line', t => {
    t.is(sliceSource(SOURCE, 1, 3, 1, 6), '345');
});

test('sliceSource joins a multi-line span', t => {
    t.is(sliceSource(SOURCE, 1, 3, 3, 4), '3456789\nabcdefghij\nABCD');
});

test('sliceSource uses whole middle lines as they are', t => {
    t.is(sliceSource(['', ' x ', ''], 1, 0, 3, 0), '\n x \n');
});

test('sliceSource tolerates lines past the end of the file', t => {
    t.is(sliceSource(['abc'], 1, 0, 1, 99), 'abc');
    t.is(sliceSource([], 1, 0, 1, 5), '');
});

// --- source: matchOperator --------------------------------------------

test('matchOperator recognises the nullish and logical operators', t => {
    t.is(matchOperator('??'), '??');
    t.is(matchOperator(' && '), '&&');
    t.is(matchOperator('||'), '||');
    t.is(matchOperator('?.'), '?.');
});

test('matchOperator strips comments and whitespace first', t => {
    t.is(matchOperator('/* why */ ??'), '??');
    t.is(matchOperator('// why not\n??'), '??');
    t.is(matchOperator('  :  '), ':');
});

test('matchOperator recognises word operators', t => {
    t.is(matchOperator('instanceof'), 'instanceof');
    t.is(matchOperator('in'), 'in');
});

test('matchOperator rejects text that is not an operator', t => {
    t.is(matchOperator(''), null);
    t.is(matchOperator('// only a comment'), null);
    t.is(matchOperator('foo'), null);
    t.is(matchOperator('a && b'), null);
});

test('matchOperator rejects an over-long fragment', t => {
    t.is(matchOperator('?? someIdentifier'), null);
    t.is(matchOperator('x'.repeat(13)), null);
});

// --- source: loadSource -----------------------------------------------

test('loadSource reads lines and the 12-digit hash', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'a.js', 'one\ntwo\n');

    const source = loadSource(path);
    t.not(source, null);
    t.deepEqual(/** @type {any} */ (source).lines, ['one', 'two', '']);
    t.regex(/** @type {any} */ (source).sha256, /^[0-9a-f]{12}$/);
    t.is(
        /** @type {any} */ (source).sha256,
        createHash('sha256').update('one\ntwo\n', 'utf8').digest('hex').slice(0, 12)
    );
});

test('loadSource strips CRLF from the hash and the lines', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'crlf.js', 'a\r\nb\r\n');

    const source = loadSource(path);
    t.deepEqual(/** @type {any} */ (source).lines, ['a', 'b', '']);
});

test('loadSource accepts a file URL', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'u.js', 'x\n');

    const source = loadSource(pathToFileURL(path).href);
    t.not(source, null);
    t.deepEqual(/** @type {any} */ (source).lines, ['x', '']);
});

test('loadSource returns null for a missing file', t => {
    const dir = tmpDir(t);
    t.is(loadSource(join(dir, 'nope.js')), null);
});

test('loadSource returns null for a directory', t => {
    const dir = tmpDir(t);
    t.is(loadSource(dir), null);
});

// --- branches: isPhantomLine ------------------------------------------

test('isPhantomLine is true for a blank or missing line', t => {
    const file = /** @type {any} */ ({ sourceLines: ['a', '   ', 'b'] });

    t.is(isPhantomLine(file, 1), false);
    t.is(isPhantomLine(file, 2), true);
    t.is(isPhantomLine(file, 99), true);
});

test('isPhantomLine is false when the source was not loaded', t => {
    t.is(isPhantomLine(/** @type {any} */ ({ sourceLines: null }), 3), false);
});

// --- branches: armDescriptors -----------------------------------------

/**
 * @param {string[] | null} sourceLines
 * @param {object} gap
 * @returns {any}
 */
function fileWith(sourceLines, gap) {
    return {
        sourceLines,
        gaps: [gap],
    };
}

/**
 * A branch arm on line 1, as istanbul writes it.
 * @param {number} column
 * @param {number} endColumn
 * @param {number} hits
 * @param {number} armNumber
 */
function arm(column, endColumn, hits, armNumber) {
    return { arm: armNumber, line: 1, column, endLine: 1, endColumn, hits };
}

test('armDescriptors names the operands of ?? and quotes their text', t => {
    const gap = {
        kind: 'branch',
        type: 'branch',
        line: 1,
        column: 10,
        arms: [arm(10, 11, 3, 1), arm(15, 18, 0, 2)],
        missingArms: [2],
    };
    const file = fileWith(['const a = b ?? "c";'], gap);

    t.deepEqual(armDescriptors(file, gap), [
        { role: 'left operand of `??`', operand: 'b' },
        { role: 'right operand of `??`', operand: '"c"' },
    ]);
});

test('armDescriptors names the sides of optional chaining', t => {
    const gap = {
        kind: 'branch',
        type: 'branch',
        line: 1,
        column: 0,
        arms: [arm(0, 1, 4, 1), arm(3, 4, 0, 2)],
        missingArms: [2],
    };
    const file = fileWith(['a?.b'], gap);

    t.deepEqual(armDescriptors(file, gap), [
        { role: 'left side of optional chaining', operand: 'a' },
        { role: 'right side of optional chaining', operand: 'b' },
    ]);
});

test('armDescriptors names the arms of an if branch', t => {
    const gap = {
        kind: 'branch',
        type: 'if',
        line: 1,
        column: 3,
        arms: [arm(3, 7, 2, 1), arm(12, 16, 0, 2)],
        missingArms: [2],
    };
    const file = fileWith(['if (flag) body(); else other();'], gap);

    t.deepEqual(
        armDescriptors(file, gap).map(item => item.role),
        ['then side', 'else side']
    );
});

test('armDescriptors numbers the arms of a switch', t => {
    const gap = {
        kind: 'branch',
        type: 'switch',
        line: 1,
        column: 0,
        arms: [arm(0, 2, 1, 1), arm(4, 6, 0, 2), arm(8, 10, 0, 3)],
        missingArms: [2, 3],
    };
    const file = fileWith(['aa bb cc dd ee'], gap);

    t.deepEqual(
        armDescriptors(file, gap).map(item => item.role),
        ['case 1', 'case 2', 'case 3']
    );
});

test('armDescriptors describes a default argument', t => {
    const gap = {
        kind: 'branch',
        type: 'default-arg',
        line: 1,
        column: 0,
        arms: [arm(0, 1, 2, 1), arm(5, 6, 0, 2)],
        missingArms: [2],
    };
    const file = fileWith(['xy = 1'], gap);

    t.deepEqual(
        armDescriptors(file, gap).map(item => item.role),
        ['default value', 'value supplied by the caller']
    );
});

test('armDescriptors falls back to the ternary sides by index', t => {
    const gap = {
        kind: 'branch',
        type: 'cond-expr',
        line: 1,
        column: 0,
        arms: [arm(0, 1, 1, 1), arm(4, 5, 0, 2)],
        missingArms: [2],
    };

    t.deepEqual(
        armDescriptors(fileWith(null, gap), gap).map(item => item.role),
        ['consequent of the ternary', 'alternate of the ternary']
    );
});

test('armDescriptors falls back to arm numbering when the source is gone', t => {
    const gap = {
        kind: 'branch',
        type: 'branch',
        line: 1,
        column: 0,
        arms: [arm(0, 1, 1, 1), arm(3, 4, 0, 2), arm(6, 7, 0, 3)],
        missingArms: [2, 3],
    };

    t.deepEqual(armDescriptors(fileWith(null, gap), gap), [
        { role: 'arm 1 of 3', operand: null },
        { role: 'arm 2 of 3', operand: null },
        { role: 'arm 3 of 3', operand: null },
    ]);
});

test('armDescriptors truncates a long operand', t => {
    const gap = {
        kind: 'branch',
        type: 'branch',
        line: 1,
        column: 0,
        arms: [arm(0, 60, 1, 1), arm(60, 61, 0, 2)],
        missingArms: [2],
    };
    const file = fileWith(['x'.repeat(61)], gap);

    const descriptor = armDescriptors(file, gap)[0];
    t.is(/** @type {any} */ (descriptor).operand.length, 48);
    t.true(/** @type {any} */ (descriptor).operand.endsWith('…'));
});

test('armDescriptors keeps only the first line of a multi-line operand', t => {
    const gap = {
        kind: 'branch',
        type: 'branch',
        line: 1,
        column: 0,
        arms: [
            { arm: 1, line: 1, column: 0, endLine: 2, endColumn: 3, hits: 1 },
            { arm: 2, line: 2, column: 5, endLine: 2, endColumn: 6, hits: 0 },
        ],
        missingArms: [2],
    };
    const file = fileWith(['aa  &&', 'bb   cc'], gap);

    t.is(/** @type {any} */ (armDescriptors(file, gap)[0]).operand, 'aa  &&');
});

test('armDescriptors yields a null operand for an empty span', t => {
    const gap = {
        kind: 'branch',
        type: 'branch',
        line: 1,
        column: 0,
        arms: [arm(0, 0, 1, 1), arm(2, 3, 0, 2)],
        missingArms: [2],
    };
    const file = fileWith(['a b'], gap);

    const descriptor = armDescriptors(file, gap)[0];
    t.is(/** @type {any} */ (descriptor).operand, null);
});

// --- json-report arguments --------------------------------------------

test('the json-report defaults match the documentation', t => {
    t.is(DEFAULT_REPORT, 'coverage/coverage-final.json');
    t.is(DEFAULT_OUTPUT, 'cov.md');
    t.is(DEFAULT_CONTEXT, 2);
    t.is(DEFAULT_MAX_LINES, 80);
});

test('VALID_SORTS lists the three orders', t => {
    t.deepEqual(VALID_SORTS, ['alpha', 'gaps', 'percent']);
});

test('CLI_OPTIONS declares every flag with the right type', t => {
    for (const name of [
        'input',
        'source',
        'output',
        'json',
        'context',
        'max-lines',
        'sort',
        'title',
        'highlight',
    ]) {
        t.true(Object.hasOwn(CLI_OPTIONS, name), name);
        t.is(CLI_OPTIONS[name].type, 'string', name);
    }

    for (const name of [
        'absolute-path',
        'git',
        'timestamp',
        'no-git',
        'no-timestamp',
        'force',
        'quiet',
        'help',
        'version',
    ]) {
        t.true(Object.hasOwn(CLI_OPTIONS, name), name);
        t.is(CLI_OPTIONS[name].type, 'boolean', name);
    }
});

test('parseMaxLinesOption requires a positive integer', t => {
    t.is(parseMaxLinesOption('1'), 1);
    t.is(parseMaxLinesOption('80'), 80);
    for (const raw of ['0', '-5', '2.5', 'lots']) {
        t.throws(() => parseMaxLinesOption(raw), { message: /Invalid --max-lines value/ });
    }
});

test('parseSortOption accepts the three modes', t => {
    for (const mode of VALID_SORTS) {
        t.is(parseSortOption(mode), mode);
    }
});

test('parseSortOption rejects an unknown mode', t => {
    t.throws(() => parseSortOption('random'), {
        message: /Invalid --sort value: "random"\. Expected one of: alpha, gaps, percent\./,
    });
});

test('parseContextOption and parseHighlightOption stay in sync with cov2md', t => {
    t.is(parseContextOption('3'), 3);
    t.throws(() => parseContextOption('-1'), { message: /Invalid --context value/ });
    t.is(parseHighlightOption('gutter'), 'gutter');
    t.throws(() => parseHighlightOption('diff'), { message: /Invalid --highlight value/ });
});

test('sliceSource treats a negative column as zero', t => {
    const lines = ['return selfPath === entryPath;'];

    t.is(sliceSource(lines, 1, -2, 1, 0), '');
    t.is(sliceSource(lines, 1, -2, 1, 6), 'return');
});

test('analyzeFile clamps negative columns from v8-to-istanbul', t => {
    const analysis = analyzeFile('/repo/src/a.js', {
        statementMap: {},
        s: {},
        fnMap: {},
        f: {},
        branchMap: {
            0: {
                type: 'branch',
                line: 41,
                locations: [
                    { start: { line: 41, column: -2 }, end: { line: 41, column: 0 } },
                    { start: { line: 41, column: 4 }, end: { line: 41, column: 9 } },
                ],
            },
        },
        b: { 0: [0, 0] },
    });

    const gap = /** @type {any} */ (analysis.gaps[0]);
    t.is(gap.column, 0);
    t.deepEqual(
        gap.arms.map(arm => [arm.column, arm.endColumn]),
        [
            [0, 0],
            [4, 9],
        ]
    );
});

test('mergeLineRanges orders two ranges with the same start by their end', t => {
    // Equal starts exercise the second half of the comparator; without it the
    // order of the two ranges is whatever the sort happened to produce.
    t.deepEqual(
        mergeLineRanges([
            { start: 5, end: 9 },
            { start: 5, end: 7 },
        ]),
        [{ start: 5, end: 9 }]
    );
});

test('loadSource returns null for a file URL that is not valid', t => {
    // `fileURLToPath` throws on a malformed URL; the catch must swallow it and
    // fall through to the plain-path attempt, which also fails here.
    t.is(loadSource('file:///%'), null);
});

test('armDescriptors recovers ? and : of a ternary from the source text', t => {
    // Three arms of `flag ? a : b`: the operator between each pair is what names
    // the role, and without it both sides fall back to "arm N of 3".
    const gap = {
        kind: 'branch',
        type: 'cond-expr',
        line: 1,
        column: 10,
        arms: [
            { arm: 1, line: 1, column: 10, endLine: 1, endColumn: 14, hits: 1 },
            { arm: 2, line: 1, column: 17, endLine: 1, endColumn: 18, hits: 0 },
            { arm: 3, line: 1, column: 21, endLine: 1, endColumn: 22, hits: 0 },
        ],
        missingArms: [2, 3],
    };

    t.deepEqual(armDescriptors(fileWith(['const r = flag ? a : b;'], gap), gap), [
        { role: 'consequent of the ternary', operand: 'flag' },
        { role: 'consequent of the ternary', operand: 'a' },
        { role: 'alternate of the ternary', operand: 'b' },
    ]);
});

test('toDisplayPath keeps the absolute path for the cwd itself', t => {
    t.is(toDisplayPath(process.cwd()), process.cwd().replace(/\\/g, '/'));
});

// --- malformed entries --------------------------------------------------
//
// istanbul writes a partial entry for a file it could not fully instrument:
// a statement with no location, a function with no count, a branch with no
// locations. Every `??` and every `: null` in `analyzeFile` exists for one of
// these, and none of them may throw — a broken entry in one file must not take
// the whole report down.

const stmt = (line, endLine) => ({
    start: { line, column: 0 },
    end: { line: endLine, column: 1 },
});

const fnMeta = (name, line) => ({
    name,
    decl: { start: { line, column: 0 }, end: { line, column: 1 } },
    loc: { start: { line, column: 0 }, end: { line, column: 1 } },
});

/**
 * A source location on one line, as istanbul writes it.
 * @param {number} line
 * @param {number} column
 */
function at(line, column) {
    return { start: { line, column }, end: { line, column: column + 1 } };
}

/** @type {Array<[string, object, (analysis: any) => (t: any) => void]>} */
const MALFORMED = [
    [
        'a statement without a location',
        { statementMap: { 0: null }, s: { 0: 0 } },
        analysis => t => t.deepEqual(analysis.gaps, []),
    ],
    [
        'a statement with no count',
        { statementMap: { 0: stmt(2, 2) }, s: {} },
        analysis => t =>
            t.deepEqual(
                analysis.gaps.map(gap => gap.kind),
                ['block']
            ),
    ],
    [
        'a function without metadata',
        { fnMap: { 0: null }, f: { 0: 0 } },
        analysis => t => t.deepEqual(analysis.uncoveredFunctions, []),
    ],
    [
        'a function with no count',
        { fnMap: { 0: fnMeta('f', 1) }, f: {} },
        analysis => t => t.deepEqual(analysis.uncoveredFunctions, [{ name: 'f', line: 1 }]),
    ],
    [
        'a function with no decl',
        { fnMap: { 0: { name: 'f', loc: fnMeta('f', 4).loc } }, f: { 0: 0 } },
        analysis => t => t.deepEqual(analysis.uncoveredFunctions, [{ name: 'f', line: 4 }]),
    ],
    [
        'a function with no position at all',
        { fnMap: { 0: { name: 'f' } }, f: { 0: 0 } },
        analysis => t => t.deepEqual(analysis.uncoveredFunctions, [{ name: 'f', line: null }]),
    ],
    [
        'an unnamed function',
        { fnMap: { 0: { ...fnMeta('', 1) } }, f: { 0: 0 } },
        analysis => t =>
            t.deepEqual(analysis.uncoveredFunctions, [{ name: '(anonymous)', line: 1 }]),
    ],
    [
        'a function whose decl has no start',
        { fnMap: { 0: { name: 'f', decl: {} } }, f: { 0: 0 } },
        analysis => t => t.deepEqual(analysis.uncoveredFunctions, [{ name: 'f', line: null }]),
    ],
    [
        'a branch without metadata',
        { branchMap: { 0: null }, b: { 0: [0] } },
        analysis => t => t.deepEqual(analysis.gaps, []),
    ],
    [
        'a branch without locations',
        { branchMap: { 0: { type: 'if' } }, b: { 0: [0] } },
        analysis => t => t.deepEqual(analysis.gaps, []),
    ],
    [
        'a branch without counts',
        { branchMap: { 0: { type: 'if', locations: [at(2, 0), at(2, 4)] } }, b: {} },
        analysis => t =>
            t.deepEqual(
                analysis.gaps[0].arms.map(a => a.hits),
                [0, 0]
            ),
    ],
    [
        // The line of a branch gap comes from its first location. Without one
        // there is no line to report, so the whole branch is dropped — better
        // than a bullet pointing at line `null`.
        'a branch whose first arm has no position',
        { branchMap: { 0: { type: 'if', locations: [{}, at(2, 4)] } }, b: { 0: [0, 0] } },
        analysis => t => t.deepEqual(analysis.gaps, []),
    ],
    [
        // A later arm without a position keeps its slot in `arms` with every
        // field null; the bullet then falls back to the generic role.
        'a later arm without a position',
        { branchMap: { 0: { type: 'if', locations: [at(2, 0), {}] } }, b: { 0: [0, 0] } },
        analysis => t => {
            const [, second] = analysis.gaps[0].arms;
            t.is(second.line, null);
            t.is(second.column, null);
            t.is(second.endLine, null);
            t.is(second.endColumn, null);
        },
    ],
    [
        'a branch with no type',
        { branchMap: { 0: { locations: [at(2, 0), at(2, 4)] } }, b: { 0: [0, 0] } },
        analysis => t => t.is(analysis.gaps[0].type, 'branch'),
    ],
];

for (const [name, entry, check] of MALFORMED) {
    test(`analyzeFile survives ${name}`, t => {
        check(analyzeFile('a.js', entry))(t);
    });
}

test('armDescriptors tolerates an arm past the end of the source', t => {
    const gap = {
        kind: 'branch',
        type: 'if',
        line: 99,
        column: 0,
        arms: [{ arm: 1, line: 99, column: 0, endLine: 99, endColumn: 4, hits: 0 }],
        missingArms: [1],
    };

    t.deepEqual(armDescriptors({ sourceLines: ['a'] }, gap), [
        { role: 'then side', operand: null },
    ]);
});
