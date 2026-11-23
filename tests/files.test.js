// @ts-check

/**
 * Selecting, ordering and labelling files: everything between "we have a
 * report" and "we have a list of labelled gaps".
 */

import test from 'ava';
import { join } from 'node:path';

import { createHash } from 'node:crypto';

import {
    assignLabels,
    buildFileReport,
    selectFiles,
    sortFiles,
    sumTotals,
} from '../src/json-report/files.js';
import { blockGap, fixtureFile } from './helpers/fixtures.js';
import { loc, tmpDir, writeFile } from './_helpers.js';
import { writeFileSync } from 'node:fs';

const REPORT = { '/repo/src/a.js': {}, '/repo/src/b.js': {}, '/repo/lib/c.js': {} };

// --- selectFiles --------------------------------------------------------

test('selectFiles: no filter returns every path, sorted', t => {
    t.deepEqual(selectFiles(REPORT, undefined), [
        '/repo/lib/c.js',
        '/repo/src/a.js',
        '/repo/src/b.js',
    ]);
});

test('selectFiles: an empty filter is no filter', t => {
    t.is(selectFiles(REPORT, '').length, 3);
});

test('selectFiles: an exact path wins', t => {
    t.deepEqual(selectFiles(REPORT, '/repo/src/b.js'), ['/repo/src/b.js']);
});

test('selectFiles: a suffix matches', t => {
    t.deepEqual(selectFiles(REPORT, 'src/b.js'), ['/repo/src/b.js']);
});

test('selectFiles: a leading ./ is ignored', t => {
    t.deepEqual(selectFiles(REPORT, './src/b.js'), ['/repo/src/b.js']);
});

test('selectFiles: a bare basename matches', t => {
    t.deepEqual(selectFiles(REPORT, 'c.js'), ['/repo/lib/c.js']);
});

test('selectFiles: two files with one basename is an error', t => {
    const report = { '/repo/one/a.js': {}, '/repo/two/a.js': {} };

    t.throws(() => selectFiles(report, 'a.js'), { message: /--source matches several files/ });
});

test('selectFiles: a filter that matches nothing names the candidates', t => {
    const error = t.throws(() => selectFiles(REPORT, 'nope.js'), {
        message: /--source did not match any file in the report: nope\.js/,
    });

    t.true(/** @type {Error} */ (error).message.includes('  /repo/src/a.js'));
});

// --- sortFiles ----------------------------------------------------------

test('sortFiles: alpha orders by display path', t => {
    const files = [fixtureFile({ displayPath: 'b.js' }), fixtureFile({ displayPath: 'a.js' })];

    t.deepEqual(
        sortFiles(files, 'alpha').map(item => item.displayPath),
        ['a.js', 'b.js']
    );
});

test('sortFiles: gaps puts the most gaps first', t => {
    const files = [
        fixtureFile({ displayPath: 'a.js', gaps: [] }),
        fixtureFile({ displayPath: 'c.js', gaps: [blockGap(1, 1), blockGap(2, 2)] }),
        fixtureFile({ displayPath: 'b.js', gaps: [blockGap(1, 1)] }),
    ];

    t.deepEqual(
        sortFiles(files, 'gaps').map(item => item.displayPath),
        ['c.js', 'b.js', 'a.js']
    );
});

test('sortFiles: equal gap counts fall back to the display path', t => {
    const files = [
        fixtureFile({ displayPath: 'b.js', gaps: [blockGap(1, 1)] }),
        fixtureFile({ displayPath: 'a.js', gaps: [blockGap(2, 2)] }),
    ];

    t.deepEqual(
        sortFiles(files, 'gaps').map(item => item.displayPath),
        ['a.js', 'b.js']
    );
});

test('sortFiles: percent puts the worst file first and 0/0 last', t => {
    const of = (displayPath, covered, total) =>
        fixtureFile({
            displayPath,
            totals: {
                statements: { covered, total },
                branches: { covered: 0, total: 0 },
                functions: { covered: 0, total: 0 },
            },
        });

    const files = [of('empty.js', 0, 0), of('half.js', 1, 2), of('full.js', 2, 2)];

    t.deepEqual(
        sortFiles(files, 'percent').map(item => item.displayPath),
        ['half.js', 'full.js', 'empty.js']
    );
});

test('sortFiles: equal percentages fall back to the display path', t => {
    const of = displayPath =>
        fixtureFile({
            displayPath,
            totals: {
                statements: { covered: 1, total: 2 },
                branches: { covered: 0, total: 0 },
                functions: { covered: 0, total: 0 },
            },
        });

    t.deepEqual(
        sortFiles([of('b.js'), of('a.js')], 'percent').map(item => item.displayPath),
        ['a.js', 'b.js']
    );
});

test('sortFiles: the input array is not mutated', t => {
    const files = [fixtureFile({ displayPath: 'b.js' }), fixtureFile({ displayPath: 'a.js' })];

    sortFiles(files, 'alpha');
    t.is(files[0].displayPath, 'b.js');
});

// --- sumTotals and assignLabels -----------------------------------------

test('sumTotals adds every counter', t => {
    const totals = sumTotals([
        fixtureFile({
            totals: {
                statements: { covered: 1, total: 2 },
                branches: { covered: 1, total: 1 },
                functions: { covered: 0, total: 1 },
            },
        }),
        fixtureFile({
            totals: {
                statements: { covered: 2, total: 3 },
                branches: { covered: 0, total: 1 },
                functions: { covered: 1, total: 1 },
            },
        }),
    ]);

    t.deepEqual(totals, {
        statements: { covered: 3, total: 5 },
        branches: { covered: 1, total: 2 },
        functions: { covered: 1, total: 2 },
    });
});

test('sumTotals of nothing is zero everywhere', t => {
    t.deepEqual(sumTotals([]), {
        statements: { covered: 0, total: 0 },
        branches: { covered: 0, total: 0 },
        functions: { covered: 0, total: 0 },
    });
});

test('assignLabels numbers continuously across files', t => {
    const first = fixtureFile({ displayPath: 'a.js', gaps: [blockGap(1, 1), blockGap(2, 2)] });
    const second = fixtureFile({ displayPath: 'b.js', gaps: [blockGap(9, 9)] });

    const labeled = assignLabels([first, second]);

    t.deepEqual(
        labeled.map(item => item.label),
        ['G1', 'G2', 'G3']
    );
    t.is(labeled[2].file, second);
});

test('assignLabels of files without gaps is empty', t => {
    t.deepEqual(assignLabels([fixtureFile()]), []);
});

// --- buildFileReport ----------------------------------------------------

test('buildFileReport reads the source, hashes it and notes the mtime', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'src/x.js', 'l1\nl2\nl3\n');

    const file = buildFileReport(
        path,
        {
            statementMap: { 0: { start: { line: 2, column: 0 }, end: { line: 2, column: 2 } } },
            s: { 0: 0 },
        },
        false
    );

    t.deepEqual(file.sourceLines, ['l1', 'l2', 'l3', '']);
    t.is(
        file.sha256,
        createHash('sha256').update('l1\nl2\nl3\n', 'utf8').digest('hex').slice(0, 12)
    );
    t.is(typeof file.mtimeMs, 'number');
    t.deepEqual([...file.blockLines], [2]);
    t.false(file.displayPath.includes('\\'));
});

test('buildFileReport honours an absolute display path', t => {
    const dir = tmpDir(t);
    const path = writeFile(dir, 'src/x.js', 'l1\n');

    t.is(buildFileReport(path, { statementMap: {}, s: {} }, true).displayPath, path);
});

test('buildFileReport survives a source that is not on disk', t => {
    const dir = tmpDir(t);

    const file = buildFileReport(join(dir, 'missing.js'), { statementMap: {}, s: {} }, false);

    t.is(file.sourceLines, null);
    t.is(file.sha256, null);
    t.is(file.mtimeMs, null);
});

test('buildFileReport keeps a branch that shares a block line when the source is gone', t => {
    // The phantom-branch filter needs the source to tell a blank line from real
    // code. Without a source it must keep the gap rather than guess: dropping it
    // would hide a real branch, and this path had no test at all.
    const dir = tmpDir(t);

    const file = buildFileReport(
        join(dir, 'missing.js'),
        {
            statementMap: { 0: { start: { line: 2, column: 0 }, end: { line: 2, column: 4 } } },
            s: { 0: 0 },
            branchMap: {
                0: { type: 'branch', line: 2, locations: [loc(2, 0, 1), loc(2, 3, 4)] },
            },
            b: { 0: [0, 0] },
        },
        false
    );

    t.is(file.sourceLines, null);
    t.deepEqual(
        file.gaps.map(gap => gap.kind),
        ['block', 'branch']
    );
});

test('selectFiles reports an empty report without a candidate list', t => {
    // The candidate list is the useful half of the message, but an empty report
    // has no candidates to list — printing "Files in the report:" followed by
    // nothing would be worse than the bare sentence.
    t.throws(() => selectFiles({}, 'src/a.js'), {
        message: '--source did not match any file in the report: src/a.js',
    });
});

test('buildFileReport drops a branch past the end of the source', t => {
    // A stale report can name a line the file no longer has. The phantom filter
    // reads that line to decide; past the end there is nothing to read, and
    // `?? ''` makes it blank — which is phantom by the same rule, so the gap is
    // dropped rather than printed against a line that does not exist.
    const dir = tmpDir(t);
    const file = join(dir, 'a.js');
    writeFileSync(file, 'a\nb\nc\n');

    const report = buildFileReport(
        file,
        {
            statementMap: {
                0: { start: { line: 1, column: 0 }, end: { line: 12, column: 1 } },
            },
            s: { 0: 0 },
            branchMap: {
                0: {
                    type: 'if',
                    locations: [
                        { start: { line: 9, column: 0 }, end: { line: 9, column: 1 } },
                        { start: { line: 9, column: 2 }, end: { line: 9, column: 3 } },
                    ],
                },
            },
            b: { 0: [0, 0] },
        },
        false
    );

    t.deepEqual(
        report.gaps.map(gap => gap.kind),
        ['block']
    );
});