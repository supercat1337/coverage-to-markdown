// @ts-check
/**
 * Grouping happens before rendering, so these tests need no Markdown: a
 * `Region` is three fields and a gap list, and the interesting question is
 * always "did these two gaps land in one region or two".
 */

import test from 'ava';

import { gapSpan, groupRegions, labelRange, regionHash } from '../src/json-report/regions.js';
import { renderWindowBlock, snippetWindow } from '../src/json-report/snippet.js';
import { blockGap, fixtureFile, linesOf } from './helpers/fixtures.js';
import { renderRegion } from '../src/json-report/render.js';

/**
 * @param {string} path
 * @param {string[] | null} sourceLines
 * @param {Array<{ name?: string, startLine: number, endLine: number }>} [functions]
 * @returns {any}
 */
function fileOf(path, sourceLines, functions = []) {
    return { path, displayPath: path, sourceLines, functions, reasons: new Map(), gaps: [] };
}

/**
 * @param {any} file
 * @param {string} label
 * @param {any} gap
 * @returns {any}
 */
function itemOf(file, label, gap) {
    return { file, label, gap };
}

test('gapSpan is the block range for a block and the line for a branch', t => {
    t.deepEqual(gapSpan({ kind: 'block', start: 3, end: 7, statements: 2 }), { start: 3, end: 7 });
    t.deepEqual(gapSpan({ kind: 'branch', line: 9 }), { start: 9, end: 9 });
});

test('groupRegions merges gaps that share one enclosing function', t => {
    const file = fileOf('src/a.js', linesOf(20), [{ name: 'pick', startLine: 1, endLine: 20 }]);
    const labeled = [
        itemOf(file, 'G1', { kind: 'block', start: 5, end: 5, statements: 1 }),
        itemOf(file, 'G2', {
            kind: 'branch',
            line: 12,
            column: 4,
            type: 'branch',
            arms: [],
            missingArms: [1],
        }),
    ];

    const regions = groupRegions(labeled, 2, 80);

    t.is(regions.length, 1);
    t.is(regions[0].gaps.length, 2);
    t.deepEqual([regions[0].win.from, regions[0].win.to], [1, 20]);
    t.is(regions[0].win.fn && regions[0].win.fn.name, 'pick');
});

test('groupRegions keeps gaps in different functions apart', t => {
    const file = fileOf('src/a.js', linesOf(60), [
        { name: 'first', startLine: 1, endLine: 20 },
        { name: 'second', startLine: 30, endLine: 50 },
    ]);
    const labeled = [
        itemOf(file, 'G1', { kind: 'block', start: 5, end: 5, statements: 1 }),
        itemOf(file, 'G2', { kind: 'block', start: 35, end: 35, statements: 1 }),
    ];

    const regions = groupRegions(labeled, 2, 80);

    t.is(regions.length, 2);
    t.deepEqual([regions[0].win.from, regions[0].win.to], [1, 20]);
    t.deepEqual([regions[1].win.from, regions[1].win.to], [30, 50]);
});

test('groupRegions never merges across files', t => {
    const functions = [{ name: 'pick', startLine: 1, endLine: 20 }];
    const labeled = [
        itemOf(fileOf('src/a.js', linesOf(20), functions), 'G1', {
            kind: 'block',
            start: 5,
            end: 5,
            statements: 1,
        }),
        itemOf(fileOf('src/b.js', linesOf(20), functions), 'G2', {
            kind: 'block',
            start: 5,
            end: 5,
            statements: 1,
        }),
    ];

    t.is(groupRegions(labeled, 2, 80).length, 2);
});

test('groupRegions puts every source-less gap of a file into one region', t => {
    const file = fileOf('src/a.js', null);
    const labeled = [
        itemOf(file, 'G1', { kind: 'block', start: 2, end: 2, statements: 1 }),
        itemOf(file, 'G2', { kind: 'block', start: 9, end: 9, statements: 1 }),
    ];

    const regions = groupRegions(labeled, 2, 80);

    t.is(regions.length, 1);
    t.true(regions[0].win.from > regions[0].win.to);
    t.deepEqual(renderWindowBlock(regions[0].file, regions[0].win, 'comment'), []);
});

test('labelRange collapses a contiguous run and lists the rest', t => {
    t.is(labelRange(['G7']), 'G7');
    t.is(labelRange(['G3', 'G4', 'G5', 'G6']), 'G3–G6');
    t.is(labelRange(['G9', 'G10']), 'G9–G10');
    t.is(labelRange(['G13', 'G15']), 'G13, G15');
    t.is(labelRange(['G1', 'G3', 'G4']), 'G1, G3, G4');
});

test('renderWindowBlock prints the shared snippet exactly once', t => {
    const file = fileOf('src/a.js', linesOf(20), [{ name: 'pick', startLine: 1, endLine: 20 }]);
    file.reasons = new Map([[5, ['UNCOVERED']]]);
    const labeled = [
        itemOf(file, 'G1', { kind: 'block', start: 5, end: 5, statements: 1 }),
        itemOf(file, 'G2', { kind: 'block', start: 12, end: 12, statements: 1 }),
    ];

    const [region] = groupRegions(labeled, 2, 80);
    const text = renderWindowBlock(region.file, region.win, 'comment').join('\n');

    t.is(text.split('```js').length - 1, 1);
    t.is(text.split('```\n').length - 1, 1);
    t.true(text.includes('l5 // 5 ← UNCOVERED'));
});

test('renderWindowBlock returns no lines for an empty window', t => {
    const file = fileOf('src/a.js', null);

    t.deepEqual(renderWindowBlock(file, snippetWindow(file, 1, 1, 2, 80), 'comment'), []);
});

test('renderWindowBlock accepts a window chosen elsewhere', t => {
    const file = fileOf('src/a.js', ['a', 'b', 'c'], [{ name: 'pick', startLine: 1, endLine: 3 }]);
    const win = { from: 2, to: 3, before: { start: 1, end: 1 }, after: null, fn: null };
    const lines = renderWindowBlock(file, win, 'none');

    t.true(lines.includes('> Lines 1–1 omitted above.'));
    t.true(lines.some(line => line.includes('b // 3') && line.includes('c // 3')) === false);
    t.true(lines.some(line => line.includes('b // 2')));
    t.true(lines.some(line => line.includes('c // 3')));
});

test('regionHash is null without source lines', t => {
    const region = /** @type {any} */ ({
        file: { sourceLines: null },
        win: { from: 1, to: 2, fn: null },
        gaps: [],
    });

    t.is(regionHash(region), null);
});

test('regionHash is null for an empty window', t => {
    // A window whose end is above its start renders nothing, so two such
    // regions must not match each other.
    const region = /** @type {any} */ ({
        file: { sourceLines: ['a', 'b'] },
        win: { from: 2, to: 1, fn: null },
        gaps: [],
    });

    t.is(regionHash(region), null);
});

test('groupRegions skips the hole between two distant gaps', t => {
    // Two gaps in one function, sixteen lines apart: the reader gets both
    // snippets and a "Lines a–b omitted" note instead of the whole body.
    const file = fixtureFile({
        sourceLines: linesOf(40),
        functions: [{ name: 'pick', startLine: 1, endLine: 40, declLine: 1 }],
    });
    const first = { label: 'G1', file, gap: blockGap(5, 5) };
    const second = { label: 'G2', file, gap: blockGap(30, 30) };

    const [region] = groupRegions([first, second], 2, 80);

    t.is(region.gaps.length, 2);
    t.true(renderRegion(region, 'comment').join('\n').includes('omitted'));
});
