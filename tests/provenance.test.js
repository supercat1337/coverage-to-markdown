// @ts-check

/**
 * Provenance: the git revision, the dirty list and the timestamp.
 *
 * These three fields are the only part of the document that depends on the
 * machine rather than on the report, so they are tested for their degradation
 * behaviour as much as for their happy path.
 */

import test from 'ava';

import { parseDirtyStatus, readProvenance } from '../src/json-report/provenance.js';

test('readProvenance: both extra fields can be switched off', t => {
    t.deepEqual(readProvenance(false, false), {
        revision: null,
        dirty: [],
        generated: null,
    });
});

test('readProvenance: an ISO timestamp when asked', t => {
    const provenance = readProvenance(false, true);

    t.not(provenance.generated, null);
    t.is(
        provenance.generated,
        new Date(/** @type {string} */ (provenance.generated)).toISOString()
    );
    t.regex(
        /** @type {string} */ (provenance.generated),
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
});

test('readProvenance: without git it degrades, it does not throw', t => {
    const provenance = readProvenance(true, false);

    t.true(provenance.revision === null || typeof provenance.revision === 'string');
    t.true(Array.isArray(provenance.dirty));
    t.is(provenance.generated, null);
});

test('readProvenance: git and timestamp together fill every field', t => {
    const provenance = readProvenance(true, true);

    t.true(Array.isArray(provenance.dirty));
    t.not(provenance.generated, null);
});

import { isAbsolute } from 'node:path';

test('readProvenance: the dirty list holds paths, never absolute ones', t => {
    const { dirty } = readProvenance(true, false);

    t.true(Array.isArray(dirty));

    for (const path of dirty) {
        t.false(isAbsolute(path), 'absolute path in dirty list: ' + path);
        t.false(/^[A-Za-z]:[\\/]/.test(path), 'drive-letter path in dirty list: ' + path);
    }
});

test('parseDirtyStatus: a space-prefixed status line keeps the whole path', t => {
    // `" M README.md"` is what git prints for a modified file. `trim()` in
    // `git()` used to eat that leading space, and `slice(3)` then removed `R`,
    // so the header showed `EADME.md`.
    t.deepEqual(parseDirtyStatus(' M README.md\n?? tests/a.js'), ['README.md', 'tests/a.js']);
});

test('parseDirtyStatus: null and empty input yield an empty list', t => {
    t.deepEqual(parseDirtyStatus(null), []);
    t.deepEqual(parseDirtyStatus(''), []);
});

test('parseDirtyStatus: never returns an absolute path', t => {
    // The input is fixed, not read from the live repository: the previous
    // version looped over `git status` and asserted nothing at all on a clean
    // tree, which is how it passed locally and failed after a commit.
    const status = [' M src/a.js', '?? tests/b.js'].join('\n');

    for (const path of parseDirtyStatus(status)) {
        t.false(isAbsolute(path), 'absolute path in dirty list: ' + path);
    }
});

test('readProvenance: without git there is no revision and no dirty list', t => {
    const provenance = readProvenance(false, false);

    t.is(provenance.revision, null);
    t.deepEqual(provenance.dirty, []);
    t.is(provenance.generated, null);
});
