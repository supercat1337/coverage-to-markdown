// @ts-check

/**
 * Staleness is the only check that can tell a reader the snippet they are about
 * to trust describes code that has since moved. It has two silences and one
 * warning, and all three are load-bearing: a false warning trains people to
 * ignore it, a missed one is worse than no check at all.
 */

import test from 'ava';
import { utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkFreshness } from '../src/json-report/freshness.js';
import { tmpDir } from './_helpers.js';

/**
 * @param {string} displayPath
 * @param {number | null} mtimeMs
 * @returns {any}
 */
function source(displayPath, mtimeMs) {
    return { displayPath, mtimeMs };
}

test('checkFreshness is silent when the report cannot be stat-ed', t => {
    // Absence of data is not evidence of a change: a report we cannot read gets
    // no warning, and `checked: 0` tells the caller nothing was compared.
    const dir = tmpDir(t);

    t.deepEqual(checkFreshness(join(dir, 'missing.json'), [source('src/a.js', Date.now())]), {
        reportTime: null,
        stale: [],
        checked: 0,
    });
});

test('checkFreshness skips a source without an mtime', t => {
    const dir = tmpDir(t);
    const report = join(dir, 'coverage.json');
    writeFileSync(report, '{}');

    const result = checkFreshness(report, [source('src/a.js', null)]);

    t.deepEqual(result.stale, []);
    t.is(result.checked, 0);
});

test('checkFreshness names a source newer than the report', t => {
    const dir = tmpDir(t);
    const report = join(dir, 'coverage.json');
    writeFileSync(report, '{}');

    // A second of grace is allowed for coarse file systems; ten is not.
    const reportMs = Date.now() - 10_000;
    utimesSync(report, reportMs / 1000, reportMs / 1000);

    const result = checkFreshness(report, [source('src/a.js', Date.now())]);

    t.deepEqual(result.stale, ['src/a.js']);
    t.is(result.checked, 1);
});

test('checkFreshness stays silent within the grace window', t => {
    const dir = tmpDir(t);
    const report = join(dir, 'coverage.json');
    writeFileSync(report, '{}');

    const result = checkFreshness(report, [source('src/a.js', Date.now())]);

    t.deepEqual(result.stale, []);
    t.is(result.checked, 1);
});
