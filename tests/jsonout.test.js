// @ts-check

/**
 * The JSON export: one entry per gap with its label, and a written file.
 *
 * This file used to carry three `buildReport` tests as well, all of them about
 * the cross-file note for duplicated snippets. That note was removed: it never
 * fired on the code this tool is pointed at, while its paragraph in the legend
 * printed on every run and a hash of every rendered region was computed to
 * decide that it did not apply. The document itself is covered by
 * `report.test.js`; `buildReport` is not called here any more.
 */

import test from 'ava';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { SCHEMA_VERSION, buildModel, writeModel } from '../src/json-report/jsonout.js';
import { assignLabels, sumTotals } from '../src/json-report/files.js';
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

    // An arm with `hits === 0` is the signal; listing it twice would invite a
    // reader to treat `missingArms` as a separate fact from the counts.
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
