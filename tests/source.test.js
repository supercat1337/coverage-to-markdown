// @ts-check

/**
 * `sliceSource` reads between two istanbul positions. A stale report can point
 * past the end of the file, and the slice must degrade to empty text rather
 * than `undefined` leaking into a bullet.
 */

import test from 'ava';

import {
    enclosingClause,
    firstLiteral,
    sliceSource,
    stripStringsAndComments,
} from '../src/json-report/source.js';

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

test('stripStringsAndComments stops at a line comment', t => {
    t.is(stripStringsAndComments('a(); // } b'), 'a(); ');
});

test('stripStringsAndComments honours an escaped quote', t => {
    // Without the escape walk the closing quote is taken at the `\"`, and `b`
    // is then blanked as if it were still string body.
    t.is(stripStringsAndComments('x "a\\"b" y'), 'x   y');
});

test('firstLiteral reads a double-quoted literal', t => {
    t.is(firstLiteral(['const s = "did not execute";'], 1, 1), 'did not execute');
});

test('firstLiteral returns null for a range past the end of the source', t => {
    t.is(firstLiteral(['a'], 5, 9), null);
});

test('enclosingClause tolerates a line past the end of the source', t => {
    t.is(enclosingClause(['a'], 99), null);
});

test('enclosingClause names a finally block', t => {
    const lines = ['try {', '  a();', '}', 'finally {', '  b();', '}'];
    t.is(enclosingClause(lines, 5), 'finally');
});
