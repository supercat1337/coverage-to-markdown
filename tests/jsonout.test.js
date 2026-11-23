// @ts-check

/**
 * The JSON export, plus the one thing only a full report can show: the
 * cross-file note about duplicated snippets.
 */

import test from 'ava';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { SCHEMA_VERSION, buildModel, writeModel } from '../src/json-report/jsonout.js';
import { assignLabels, sumTotals } from '../src/json-report/files.js';
import { buildReport } from '../src/json-report/report.js';
import { blockGap, fixtureFile } from './helpers/fixtures.js';
import { tmpDir } from './_helpers.js';

/**
 * @param {import('../src/json-report/types.js').FileReport[]} files
 * @param {object} [overrides]
 * @returns {any}
 */
function modelOf(files, overrides = {}) {
    return buildModel({
        report: 'coverage/coverage-final.json',
        scope: 'all files',
        provenance: { revision: 'abc1234', dirty: [], generated: null },
        totals: sumTotals(files),
        files,
        labeled: assignLabels(files),
        ...overrides,
    });
}

/**
 * Count the cross-file notes. The legend in "How to read this file" quotes the
 * note verbatim inside backticks, so a plain substring count is off by one; a
 * real note starts its own line.
 * @param {string} md
 * @returns {number}
 */
function countNotes(md) {
    return md.split('\n> The same code appears in ').length - 1;
}

// --- schema -------------------------------------------------------------

test('SCHEMA_VERSION is one', t => {
    t.is(SCHEMA_VERSION, 1);
});

test('buildModel: one entry per gap, carrying the shared label', t => {
    const file = fixtureFile({
        gaps: [
            blockGap(2, 3, 2),
            {
                kind: 'branch',
                type: 'if',
                line: 5,
                column: 4,
                arms: [{ arm: 1, line: 5, column: 4, endLine: 5, endColumn: 5, hits: 1 }],
                missingArms: [1],
            },
        ],
    });

    const model = modelOf([file]);

    t.is(model.schema, SCHEMA_VERSION);
    t.is(model.revision, 'abc1234');
    t.deepEqual(model.numbering, { lines: '1-based', columns: '0-based', arms: '1-based' });
    t.deepEqual(model.files[0].gaps[0], {
        label: 'G1',
        kind: 'block',
        startLine: 2,
        endLine: 3,
        statements: 2,
    });
    t.is(model.files[0].gaps[1].label, 'G2');
    t.is(model.files[0].gaps[1].arms[0].hits, 1);
});

test('buildModel: the missing arms are not repeated', t => {
    const file = fixtureFile({
        gaps: [
            {
                kind: 'branch',
                type: 'if',
                line: 5,
                column: 4,
                arms: [
                    { arm: 1, line: 5, column: 4, endLine: 5, endColumn: 5, hits: 1 },
                    { arm: 2, line: 5, column: 9, endLine: 5, endColumn: 10, hits: 0 },
                ],
                missingArms: [2],
            },
        ],
    });

    t.false(Object.hasOwn(modelOf([file]).files[0].gaps[0], 'missingArms'));
});

test('buildModel: each file lists only its own gaps', t => {
    const first = fixtureFile({ displayPath: 'a.js', gaps: [blockGap(1, 1)] });
    const second = fixtureFile({ displayPath: 'b.js', gaps: [blockGap(9, 9)] });

    const model = modelOf([first, second]);

    t.is(model.files[0].gaps[0].label, 'G1');
    t.is(model.files[1].gaps[0].label, 'G2');
});

test('writeModel: indented JSON with a trailing newline', t => {
    const dir = tmpDir(t);
    const path = join(dir, 'gaps.json');

    writeModel({ schema: 1, files: [] }, path);

    const raw = readFileSync(path, 'utf8');
    t.true(raw.endsWith('}\n'));
    t.true(raw.includes('\n  "files"'));
    t.deepEqual(JSON.parse(raw), { schema: 1, files: [] });
});

// --- duplicated snippets ------------------------------------------------

/**
 * Two files whose uncovered line carries byte-identical text. This is the only
 * way to reach the cross-file note, which lives behind a hash of the rendered
 * snippet.
 * @returns {[import('../src/json-report/types.js').FileReport, import('../src/json-report/types.js').FileReport]}
 */
function duplicatedPair() {
    const shared = () => ({
        sourceLines: ['a', 'b', 'return 1;', 'd', 'e'],
        gaps: [blockGap(3, 3)],
        reasons: new Map([[3, ['UNCOVERED']]]),
    });

    return [
        fixtureFile({ path: '/repo/src/a.js', displayPath: 'src/a.js', ...shared() }),
        fixtureFile({ path: '/repo/src/b.js', displayPath: 'src/b.js', ...shared() }),
    ];
}

test('buildReport: identical snippets get a cross-file note on both sides', t => {
    const [first, second] = duplicatedPair();

    const md = buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'coverage/coverage-final.json',
        scopeText: 'all files · 2 files',
        files: [first, second],
        labeled: assignLabels([first, second]),
        totals: sumTotals([first, second]),
        contextLines: 2,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
    });

    t.is(countNotes(md), 2, 'once per occurrence');
    t.true(md.includes('> The same code appears in `src/b.js`'));
    t.true(md.includes('> The same code appears in `src/a.js`'));
});

test('buildReport: a note names the labels of the other occurrence', t => {
    const [first, second] = duplicatedPair();
    const md = buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'r.json',
        scopeText: 'all files · 2 files',
        files: [first, second],
        labeled: assignLabels([first, second]),
        totals: sumTotals([first, second]),
        contextLines: 2,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
    });

    // G1 is in a.js, G2 in b.js, so the note in one section names the other.
    t.true(md.includes('`src/b.js` G2'));
    t.true(md.includes('`src/a.js` G1'));
});

test('buildReport: distinct snippets get no note', t => {
    const first = fixtureFile({ displayPath: 'src/a.js', gaps: [blockGap(2, 2)] });
    const second = fixtureFile({ displayPath: 'src/b.js', gaps: [blockGap(4, 4)] });

    const md = buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'coverage/coverage-final.json',
        scopeText: 'all files · 2 files',
        files: [first, second],
        labeled: assignLabels([first, second]),
        totals: sumTotals([first, second]),
        contextLines: 2,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
    });

    t.is(countNotes(md), 0);
});
