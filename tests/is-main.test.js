// @ts-check

/**
 * The main-module check has one job and three ways to say "no": no entry
 * point, an entry that cannot be resolved, and an entry that is a different
 * file. All three must be silent — a false positive runs a CLI inside a test
 * run, which is the kind of failure that looks like a hang.
 *
 * `test.serial` throughout: the tests replace `process.argv[1]`, which is
 * shared by every test in this file.
 */

import test from 'ava';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isMainModule } from '../src/is-main.js';
import { tmpDir } from './_helpers.js';

/**
 * Run `fn` with `process.argv[1]` set to `entry`, restoring it afterwards.
 * @param {string | undefined} entry
 * @param {() => void} fn
 * @returns {void}
 */
function withEntry(entry, fn) {
    const saved = process.argv;
    process.argv = entry === undefined ? [saved[0]] : [saved[0], entry];
    try {
        fn();
    } finally {
        process.argv = saved;
    }
}

test.serial('isMainModule is false without an entry point', t => {
    withEntry(undefined, () => {
        t.false(isMainModule(import.meta.url));
    });
});

test.serial('isMainModule is false when the entry cannot be resolved', t => {
    // A deleted entry file, or an `npm link` shim pointing at a path that no
    // longer exists. `realpathSync` throws and the catch answers "no".
    withEntry(join(tmpDir(t), 'missing.js'), () => {
        t.false(isMainModule(import.meta.url));
    });
});

test.serial('isMainModule is false when the module URL is not a file', t => {
    const dir = tmpDir(t);
    const entry = join(dir, 'entry.js');
    writeFileSync(entry, '');

    withEntry(entry, () => {
        t.false(isMainModule('https://example.com/entry.js'));
    });
});

test.serial('isMainModule is true when the entry is this module', t => {
    const dir = tmpDir(t);
    const entry = join(dir, 'entry.js');
    writeFileSync(entry, '');

    withEntry(entry, () => {
        t.true(isMainModule(pathToFileURL(entry).href));
    });
});

test.serial('isMainModule is false for a different module', t => {
    const dir = tmpDir(t);
    const entry = join(dir, 'entry.js');
    const other = join(dir, 'other.js');
    writeFileSync(entry, '');
    writeFileSync(other, '');

    withEntry(entry, () => {
        t.false(isMainModule(pathToFileURL(other).href));
    });
});
