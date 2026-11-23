// @ts-check

/**
 * The snippet layer: which window a gap gets, how it is cut, and how the
 * fences around it grow.
 *
 * Nothing here renders a document — a window is a data structure and a snippet
 * is a string, so a failure names the rule rather than a paragraph of Markdown.
 */

import test from 'ava';

import {
    enclosingFunction,
    expandThroughJsdoc,
    fenceLength,
    renderOneWindow,
    renderSnippet,
    renderWindowBlock,
    snippetBlock,
    snippetWindow,
} from '../src/json-report/snippet.js';
import { fixtureFile, linesOf } from './helpers/fixtures.js';

const SPANS = [
    { name: 'outer', startLine: 1, endLine: 30, declLine: 1 },
    { name: 'inner', startLine: 5, endLine: 25, declLine: 5 },
];

// --- enclosingFunction --------------------------------------------------

test('enclosingFunction: the narrowest containing span wins', t => {
    t.is(/** @type {any} */ (enclosingFunction(SPANS, 10, 1)).name, 'inner');
});

test('enclosingFunction: a span shorter than the threshold is skipped', t => {
    const spans = [
        { name: 'method', startLine: 1, endLine: 30, declLine: 1 },
        { name: 'arrow', startLine: 10, endLine: 10, declLine: 10 },
    ];

    t.is(/** @type {any} */ (enclosingFunction(spans, 10, 8)).name, 'method');
    t.is(/** @type {any} */ (enclosingFunction(spans, 10, 1)).name, 'arrow');
});

test('enclosingFunction: nothing contains the line', t => {
    t.is(enclosingFunction([{ name: 'a', startLine: 1, endLine: 5, declLine: 1 }], 9, 1), null);
    t.is(enclosingFunction([], 3, 1), null);
});

test('enclosingFunction: an equal-length tie keeps the first span', t => {
    const spans = [
        { name: 'first', startLine: 1, endLine: 10, declLine: 1 },
        { name: 'second', startLine: 1, endLine: 10, declLine: 1 },
    ];

    t.is(/** @type {any} */ (enclosingFunction(spans, 5, 1)).name, 'first');
});

// --- snippetWindow ------------------------------------------------------

test('snippetWindow: a long enough enclosing function becomes the window', t => {
    const file = fixtureFile({ sourceLines: linesOf(30) });
    file.functions = [{ name: 'm', startLine: 10, endLine: 20, declLine: 10 }];

    t.deepEqual(snippetWindow(file, 15, 15, 2, 80), {
        from: 10,
        to: 20,
        before: null,
        after: null,
        fn: { name: 'm', startLine: 10, endLine: 20, declLine: 10 },
    });
});

test('snippetWindow: without a function it falls back to context', t => {
    const win = snippetWindow(fixtureFile({ sourceLines: linesOf(20) }), 10, 12, 2, 80);

    t.is(win.from, 8);
    t.is(win.to, 14);
    t.is(win.fn, null);
});

test('snippetWindow: the context window is clamped to the file', t => {
    const win = snippetWindow(fixtureFile({ sourceLines: ['a', 'b', 'c'] }), 1, 1, 5, 80);

    t.is(win.from, 1);
    t.is(win.to, 3);
});

test('snippetWindow: a capped window reports what it cut', t => {
    const file = fixtureFile({ sourceLines: linesOf(100) });
    file.functions = [{ name: 'huge', startLine: 1, endLine: 100, declLine: 1 }];

    const win = snippetWindow(file, 50, 50, 2, 10);
    t.is(win.from, 47);
    t.is(win.to, 56);
    t.deepEqual(win.before, { start: 1, end: 46 });
    t.deepEqual(win.after, { start: 57, end: 100 });
});

test('snippetWindow: an empty source gives an empty window', t => {
    t.deepEqual(snippetWindow(fixtureFile({ sourceLines: [] }), 1, 1, 2, 80), {
        from: 1,
        to: 0,
        before: null,
        after: null,
        fn: null,
    });
});

// --- fenceLength --------------------------------------------------------

test('fenceLength: three backticks when the snippet holds none', t => {
    t.is(fenceLength(['a', 'b'], 1, 2), 3);
});

test('fenceLength: one more than the longest run inside the window', t => {
    t.is(fenceLength(['a ```js', 'b'], 1, 2), 4);
    t.is(fenceLength(['``````', 'x'], 1, 2), 7);
});

test('fenceLength: only the requested window counts', t => {
    t.is(fenceLength(['```', 'x', 'y'], 2, 3), 3);
});

test('fenceLength: the window is clamped to the array', t => {
    t.is(fenceLength([], 1, 5), 3);
    t.is(fenceLength(['```'], 0, 99), 4);
});

// --- renderSnippet ------------------------------------------------------

const BODY = ['a', 'b'];

test('renderSnippet: comment mode appends the reason', t => {
    t.is(
        renderSnippet(BODY, 1, 2, new Map([[2, ['UNCOVERED']]]), 'comment'),
        'a // 1\nb // 2 ← UNCOVERED'
    );
});

test('renderSnippet: gutter mode marks the line in the margin', t => {
    t.is(
        renderSnippet(BODY, 1, 2, new Map([[2, ['UNCOVERED']]]), 'gutter'),
        '  1 │ a\n> 2 │ b ← UNCOVERED'
    );
});

test('renderSnippet: none mode drops the reason on purpose', t => {
    t.is(renderSnippet(BODY, 1, 2, new Map([[2, ['UNCOVERED']]]), 'none'), 'a // 1\nb // 2');
});

test('renderSnippet: several notes on one line are joined', t => {
    const reasons = new Map([[1, ['UNCOVERED', 'BRANCH 2/2']]]);

    t.true(renderSnippet(['x'], 1, 1, reasons, 'comment').endsWith('← UNCOVERED · BRANCH 2/2'));
});

// --- snippetBlock -------------------------------------------------------

test('snippetBlock: a fenced block with the detected language', t => {
    const file = fixtureFile({
        path: 'src/a.js',
        sourceLines: ['l1', 'l2', 'l3', 'l4'],
        reasons: new Map([[3, ['UNCOVERED']]]),
    });

    t.deepEqual(snippetBlock(file, 3, 3, 1, 80, 'comment'), [
        '```js',
        'l2 // 2\nl3 // 3 ← UNCOVERED\nl4 // 4',
        '```',
        '',
    ]);
});

test('snippetBlock: the cut edges are labelled', t => {
    const file = fixtureFile({ sourceLines: linesOf(20) });
    file.functions = [{ name: 'f', startLine: 1, endLine: 20, declLine: 1 }];

    const block = snippetBlock(file, 10, 10, 2, 4, 'none');
    t.is(block[0], '> Lines 1–8 omitted above.');
    t.true(block.includes('> Lines 13–20 omitted below.'));
});

test('snippetBlock: no source means no block', t => {
    t.deepEqual(snippetBlock(fixtureFile({ sourceLines: null }), 1, 1, 2, 80, 'comment'), []);
    t.deepEqual(snippetBlock(fixtureFile({ sourceLines: [] }), 1, 1, 2, 80, 'comment'), []);
});

// --- renderWindowBlock and renderOneWindow -----------------------------

test('renderWindowBlock: the shared snippet is printed exactly once', t => {
    const file = fixtureFile({
        sourceLines: linesOf(20),
        reasons: new Map([[5, ['UNCOVERED']]]),
    });
    file.functions = [{ name: 'pick', startLine: 1, endLine: 20, declLine: 1 }];

    const text = renderWindowBlock(file, snippetWindow(file, 5, 12, 2, 80), 'comment').join('\n');

    t.is(text.split('```js').length - 1, 1);
    t.true(text.includes('l5 // 5 ← UNCOVERED'));
});

test('renderWindowBlock: an empty window renders nothing', t => {
    const file = fixtureFile({ sourceLines: null });

    t.deepEqual(renderWindowBlock(file, snippetWindow(file, 1, 1, 2, 80), 'comment'), []);
});

test('renderWindowBlock: a hole splits the window in two blocks', t => {
    const file = fixtureFile({ sourceLines: linesOf(60) });
    const win = { from: 1, to: 60, before: null, after: null, fn: null };

    const lines = renderWindowBlock(file, win, 'none', [{ start: 8, end: 47 }]);
    const text = lines.join('\n');

    t.is(text.split('```js').length - 1, 2, 'two separate fences');
    t.true(text.includes('> Lines 8–47 omitted'));
    t.true(text.includes('l5 // 5'));
    t.true(text.includes('l50 // 50'));
});

test('renderOneWindow: no holes is the plain span', t => {
    const file = fixtureFile({ sourceLines: linesOf(10) });
    const win = { from: 3, to: 5, before: null, after: null, fn: null };

    t.deepEqual(renderOneWindow(file, win, 'none'), renderWindowBlock(file, win, 'none'));
});

test('renderOneWindow: a trailing hole leaves one block', t => {
    const file = fixtureFile({ sourceLines: linesOf(20) });
    const win = { from: 1, to: 20, before: null, after: null, fn: null };

    const text = renderOneWindow(file, win, 'none', [{ start: 15, end: 20 }]).join('\n');
    t.is(text.split('```js').length - 1, 1);
    t.true(text.includes('> Lines 15–20 omitted'));
});

// --- expandThroughJsdoc -------------------------------------------------

const DOC_LINES = ['/**', ' * Doc.', ' */', 'function f() {', '}'];

test('expandThroughJsdoc: climbs to the opening of the block', t => {
    t.is(expandThroughJsdoc(DOC_LINES, 4, 60), 1);
});

test('expandThroughJsdoc: a single-line comment is one step', t => {
    t.is(expandThroughJsdoc(['code', '/** one liner */', 'function f() {}'], 3, 60), 2);
});

test('expandThroughJsdoc: nothing ends with */ so the line stays', t => {
    t.is(expandThroughJsdoc(['const a = 1;', 'function f() {}'], 2, 60), 2);
});

test('expandThroughJsdoc: the climb stops at the line budget', t => {
    t.is(expandThroughJsdoc(DOC_LINES, 4, 1), 3);
    t.is(expandThroughJsdoc(DOC_LINES, 4, 2), 2);
});

test('expandThroughJsdoc: cannot climb above the first line', t => {
    t.is(expandThroughJsdoc(DOC_LINES, 1, 60), 1);
});

test('expandThroughJsdoc: a line that is not comment text ends the climb', t => {
    // The ` */` above the body opens the block, then `b` is neither empty nor
    // a `*` continuation, so the climb must stop before it.
    t.is(expandThroughJsdoc(['a', 'b', ' */', 'function f() {}'], 4, 60), 3);
});

test('expandThroughJsdoc returns the body line when it is past the end', t => {
    // A stale report can name a function that no longer exists; the climb must
    // not read past the array.
    t.is(expandThroughJsdoc([], 5, 10), 5);
});

test('renderSnippet pads a window past the end with empty lines', t => {
    t.is(renderSnippet(['a'], 1, 2, new Map(), 'comment'), 'a // 1\n // 2');
});
