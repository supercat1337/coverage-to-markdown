// @ts-check

/**
 * Rendering of one region: heading, gap bullets, the snippet and the notes
 * that decorate them.
 *
 * Assertions here are made on one fact each — the heading starts with the
 * label, the bullet mentions "else side" — instead of on a whole rendered
 * block. A full-string comparison breaks on every wording tweak and, worse,
 * does not say which of the twenty facts inside it actually changed.
 */

import test from 'ava';

import { groupRegions } from '../src/json-report/regions.js';
import { renderRegion } from '../src/json-report/render.js';
import { blockGap, branchArm, fixtureFile, fixtureItem, linesOf } from './helpers/fixtures.js';

/**
 * Render one labeled gap exactly as `buildReport` would.
 * @param {import('../src/json-report/types.js').LabeledGap} item
 * @param {object} [options]
 * @param {import('../src/json-report/types.js').HighlightMode} [options.highlight]
 * @param {number} [options.contextLines]
 * @param {number} [options.maxLines]
 * @param {string | null} [options.alsoIn]
 * @returns {string[]}
 */
function linesOfRegion(item, options = {}) {
    const { highlight = 'comment', contextLines = 0, maxLines = 80, alsoIn = null } = options;
    const [region] = groupRegions([item], contextLines, maxLines);
    return renderRegion(region, highlight, alsoIn);
}

/**
 * @param {import('../src/json-report/types.js').LabeledGap} item
 * @param {object} [options] see `linesOfRegion`
 * @returns {string}
 */
function textOf(item, options = {}) {
    return linesOfRegion(item, options).join('\n');
}

// --- heading ------------------------------------------------------------

test('renderRegion: block outside a function names the span only', t => {
    const item = fixtureItem(blockGap(2, 3, 2));

    t.is(linesOfRegion(item)[0], '### G1 · in `?` · lines 2–3');
});

test('renderRegion: branch inside a function names the function and its span', t => {
    const item = fixtureItem(
        { kind: 'branch', type: 'if', line: 5, column: 4, arms: [], missingArms: [] },
        {
            sourceLines: linesOf(10),
            functions: [{ name: 'pick', startLine: 1, endLine: 10, declLine: 1 }],
        }
    );

    const heading = linesOfRegion(item)[0];
    t.true(heading.includes('in `pick`'));
    t.true(heading.includes('lines 1–10'));
});

test('renderRegion: a capped window marks the heading as an excerpt', t => {
    const item = fixtureItem(blockGap(50, 50), {
        sourceLines: linesOf(100),
        functions: [{ name: 'huge', startLine: 1, endLine: 100, declLine: 1 }],
    });

    t.true(linesOfRegion(item, { maxLines: 10 })[0].includes('(excerpt)'));
});

test('renderRegion: gaps sharing one function collapse into a label range', t => {
    // One file object shared by both items, and an enclosing function long
    // enough to be the window for both lines — otherwise each gap gets its own
    // short context window and they never share a region.
    const file = fixtureFile({
        sourceLines: linesOf(20),
        functions: [{ name: 'pick', startLine: 1, endLine: 20, declLine: 1 }],
    });
    const first = { label: 'G1', file, gap: blockGap(5, 5) };
    const second = { label: 'G2', file, gap: blockGap(12, 12) };

    const [region] = groupRegions([first, second], 2, 80);

    t.is(region.gaps.length, 2);
    t.true(renderRegion(region, 'comment')[0].startsWith('### G1–G2 ·'));
});

// --- bullets ------------------------------------------------------------

test('renderRegion: a block bullet counts its statements in the plural', t => {
    const text = textOf(fixtureItem(blockGap(2, 3, 2)));

    t.true(text.includes('**G1** lines 2–3 · block · 2 statements never executed'));
});

test('renderRegion: a block bullet uses the singular for one statement', t => {
    const text = textOf(fixtureItem(blockGap(3, 3, 1)));

    t.true(text.includes('1 statement never executed'));
});

test('renderRegion: a branch bullet names the missing side and its operand', t => {
    const item = fixtureItem(
        {
            kind: 'branch',
            type: 'if',
            line: 1,
            column: 4,
            arms: [branchArm(1, 1, 4, 5, 3), branchArm(2, 1, 15, 16, 0)],
            missingArms: [2],
        },
        { sourceLines: ['if (a) b; else c;'] }
    );

    const bullet = linesOfRegion(item).find(line => line.startsWith('- **G1**'));
    t.true(/** @type {string} */ (bullet).includes('else side'));
    t.true(/** @type {string} */ (bullet).includes('never executed'));
});

test('renderRegion: several missing arms become a summary plus nested bullets', t => {
    const item = fixtureItem(
        {
            kind: 'branch',
            type: 'switch',
            line: 1,
            column: 0,
            arms: [branchArm(1, 1, 0, 1, 1), branchArm(2, 1, 4, 5, 0), branchArm(3, 1, 8, 9, 0)],
            missingArms: [2, 3],
        },
        { sourceLines: null }
    );

    const lines = linesOfRegion(item);
    t.true(lines.includes('  - arm 2 of 3 — case 2'));
    t.true(lines.includes('  - arm 3 of 3 — case 3'));
});

test('renderRegion: every arm missing is stated as such', t => {
    const item = fixtureItem(
        {
            kind: 'branch',
            type: 'switch',
            line: 1,
            column: 0,
            arms: [branchArm(1, 1, 0, 1, 0), branchArm(2, 1, 4, 5, 0)],
            missingArms: [1, 2],
        },
        { sourceLines: null }
    );

    t.true(textOf(item).includes('no arm ever executed'));
});

// --- notes --------------------------------------------------------------

test('renderRegion: a branch already shown as a block gets no second snippet', t => {
    const item = fixtureItem(
        {
            kind: 'branch',
            type: 'if',
            line: 2,
            column: 0,
            arms: [branchArm(1, 2, 0, 1, 0)],
            missingArms: [1],
        },
        {
            sourceLines: ['a', 'if (x) y;', 'c'],
            blockLines: new Set([2]),
            reasons: new Map([[2, ['UNCOVERED']]]),
        }
    );

    t.false(linesOfRegion(item).some(line => line.startsWith('```')));
});

test('renderRegion: the cross-file note is printed when one is supplied', t => {
    const text = textOf(fixtureItem(blockGap(2, 2)), { alsoIn: '> same code in `src/b.js` G4' });

    t.true(text.includes('> same code in `src/b.js` G4'));
});

// --- snippet ------------------------------------------------------------

test('renderRegion: the snippet carries the fence language and the reasons', t => {
    const item = fixtureItem(blockGap(2, 3, 2), {
        reasons: new Map([
            [2, ['UNCOVERED']],
            [3, ['UNCOVERED']],
        ]),
    });

    const lines = linesOfRegion(item);
    t.true(lines.includes('```js'));
    t.true(lines.join('\n').includes('l2 // 2 ← UNCOVERED'));
    t.true(lines.join('\n').includes('l3 // 3 ← UNCOVERED'));
});

test('renderRegion: an unreadable source yields the bullets and no fence', t => {
    const lines = linesOfRegion(fixtureItem(blockGap(2, 2), { sourceLines: null }));

    t.true(lines.some(line => line.startsWith('- **G1**')));
    t.false(lines.some(line => line.startsWith('```')));
});

test('renderRegion: a branch on a blank line gets the phantom warning', t => {
    const item = fixtureItem(
        {
            kind: 'branch',
            type: 'branch',
            line: 2,
            column: 0,
            arms: [branchArm(1, 2, 0, 1, 0)],
            missingArms: [1],
        },
        { sourceLines: ['a', '   ', 'b'] }
    );

    const text = textOf(item);
    t.true(text.includes('> G1: the reported line holds no code.'));
    t.true(text.includes('treat it as noise before writing a test.'));
});

test('renderGapLine: a missing arm with no descriptor still renders', t => {
    // A hand-written or third-party report can name an arm that has no
    // descriptor. One broken bullet must not take the whole document down.
    const item = fixtureItem({
        kind: 'branch',
        type: 'if',
        line: 2,
        column: 0,
        arms: [branchArm(1, 2, 0, 1, 0)],
        missingArms: [1, 5],
    });

    t.true(textOf(item).includes('the arm'));
});

test('renderGapLine: a generic role with an operand drops the role', t => {
    // `arm 1 of 1 (\`: String(error)\`)` says nothing the bullet does not
    // already say, so the operand stands alone. The arm must be a fragment of
    // the line, not the whole line: an arm that fills its line is the statement
    // itself, already printed below the bullet, and is suppressed.
    const item = fixtureItem(
        {
            kind: 'branch',
            type: 'branch',
            line: 2,
            column: 4,
            arms: [branchArm(1, 2, 4, 20, 0)],
            missingArms: [1],
        },
        { sourceLines: ['x', 'foo : String(error)'] }
    );

    const text = textOf(item);
    t.true(text.includes('(`: String(error)`)'));
    t.false(text.includes('arm 1 of 1'));
});
