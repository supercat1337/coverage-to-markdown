// @ts-check

/**
 * `sliceSource` reads between two istanbul positions. A stale report can point
 * past the end of the file, and the slice must degrade to empty text rather
 * than `undefined` leaking into a bullet.
 */

import test from 'ava';

import { sliceSource } from '../src/json-report/source.js';

test('sliceSource returns empty text for a range past the end', t => {
    // Empty array: `lines[fromLine - 1]` is undefined on the first line and
    // inside the loop, and `lines[toLine - 1]` is undefined at the end.
    t.is(sliceSource([], 1, 0, 3, 1), '\n\n');
});

test('sliceSource keeps the tail of the first line', t => {
    t.is(sliceSource(['abc'], 1, 1, 1, 3), 'bc');
});

test('sliceSource joins a multi-line range', t => {
    t.is(sliceSource(['abc', 'def', 'ghi'], 1, 1, 3, 2), 'bc\ndef\ngh');
});

test('sliceSource pads a range that starts past the end', t => {
    t.is(sliceSource(['a'], 5, 0, 7, 1), '\n\n');
});
