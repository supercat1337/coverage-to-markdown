// @ts-check

/**
 * `buildReport` renders the document from parts that are already analysed.
 * Every test here varies one part and asserts the line it produces.
 *
 * These lived in `json-report-render.test.js`, which described the old
 * `renderGap` shim and was deleted with it. The nineteen branches of
 * `buildReport` went with them, which is why the file sat at 88.5 %.
 */

import test from 'ava';

import { assignLabels, sumTotals } from '../src/json-report/files.js';
import { buildReport } from '../src/json-report/report.js';
import { blockGap, fixtureFile, linesOf } from './helpers/fixtures.js';

/**
 * One file with one block gap, rendered with the given overrides.
 * @param {object} [options]
 * @param {object} [options.file] extra fields for `fixtureFile`
 * @param {object} [options.report] extra fields for `buildReport`
 * @returns {string}
 */
function render(options = {}) {
    const file = /** @type {any} */ (
        fixtureFile({
            displayPath: 'src/a.js',
            sourceLines: ['a', 'b', 'c', 'd'],
            gaps: [blockGap(2, 2)],
            ...options.file,
        })
    );
    const labeled = file.gaps.map((gap, index) => ({ file, gap, label: 'G' + (index + 1) }));

    return buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'coverage/coverage-final.json',
        scopeText: 'all files · 1 file',
        files: [file],
        labeled,
        totals: sumTotals([file]),
        contextLines: 1,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
        ...options.report,
    });
}

// --- header -------------------------------------------------------------

test('buildReport prints the revision when git knows it', t => {
    const md = render({
        report: { provenance: { revision: 'abc1234', dirty: [], generated: null } },
    });

    t.true(md.includes('Revision: `abc1234`'));
    t.true(md.includes('Dirty: none'));
});

test('buildReport lists dirty files', t => {
    const md = render({
        report: { provenance: { revision: 'abc1234', dirty: ['a.js', 'b.js'], generated: null } },
    });

    t.true(md.includes('Dirty: 2 file(s) — `a.js`, `b.js`'));
});

test('buildReport prints the revision placeholder without git', t => {
    const md = render();

    t.true(md.includes('Revision: — (git unavailable)'));
    t.false(md.includes('Dirty:'));
});

test('buildReport prints the generation time when it is known', t => {
    const md = render({
        report: {
            provenance: { revision: null, dirty: [], generated: '2026-01-01T00:00:00.000Z' },
        },
    });

    t.true(md.includes('Generated: `2026-01-01T00:00:00.000Z`'));
});

// --- staleness ----------------------------------------------------------

test('buildReport warns about stale coverage', t => {
    const md = render({
        report: {
            freshness: { reportTime: '2026-01-01T00:00:00.000Z', stale: ['src/a.js'], checked: 1 },
        },
    });

    t.true(md.includes('> **Stale coverage:** 1 of 1 source file(s) changed'));
    t.true(md.includes('Regenerate before trusting a snippet'));
});

test('buildReport truncates a long stale list', t => {
    // `STALE_LISTED` is five; the sixth name must not be printed, only counted.
    const stale = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'];
    const md = render({ report: { freshness: { reportTime: null, stale, checked: 6 } } });

    t.true(md.includes('6 of 6 source file(s) changed'));
    t.true(md.includes('and 1 more'));
    t.false(md.includes('`f.js`'));
});

test('buildReport stays silent when nothing is stale', t => {
    t.false(render().includes('Stale coverage'));
});

// --- legend -------------------------------------------------------------

test('buildReport explains the no-highlight legend', t => {
    const md = render({ report: { highlight: 'none' } });

    t.true(md.includes('Snippets carry only line-number comments'));
    t.false(md.includes('← UNCOVERED` — the line never executed'));
});

test('buildReport explains the gutter legend', t => {
    const md = render({ report: { highlight: 'gutter' } });

    t.true(md.includes('in the gutter marks a line that belongs to a gap'));
});

test('buildReport explains the comment legend by default', t => {
    t.true(render().includes('← UNCOVERED` — the line never executed'));
});

// --- per-file section ---------------------------------------------------

test('buildReport names a function without a line', t => {
    const md = render({
        file: { uncoveredFunctions: [{ name: 'orphan', line: null }] },
    });

    t.true(md.includes('Never called: `orphan`'));
    t.false(md.includes('`orphan` (line'));
});

test('buildReport names a function with its line', t => {
    const md = render({
        file: { uncoveredFunctions: [{ name: 'orphan', line: 7 }] },
    });

    t.true(md.includes('Never called: `orphan` (line 7)'));
});

test('buildReport says when the source is unreadable', t => {
    const md = render({ file: { sourceLines: null } });

    t.true(md.includes('> Source file is not readable on disk, so snippets are omitted.'));
});

// --- duplicate notes ----------------------------------------------------

test('buildReport stays silent about duplicates when the source is gone', t => {
    // `regionHash` returns null without source lines, so no two regions can be
    // compared and no note is printed — even when the gaps are identical.
    const first = /** @type {any} */ (
        fixtureFile({ displayPath: 'src/a.js', sourceLines: null, gaps: [blockGap(2, 2)] })
    );
    const second = /** @type {any} */ (
        fixtureFile({ displayPath: 'src/b.js', sourceLines: null, gaps: [blockGap(2, 2)] })
    );
    const labeled = [first, second].map((file, index) => ({
        file,
        gap: file.gaps[0],
        label: 'G' + (index + 1),
    }));

    const md = buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'coverage/coverage-final.json',
        scopeText: 'all files · 2 files',
        files: [first, second],
        labeled,
        totals: sumTotals([first, second]),
        contextLines: 1,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
    });

    // The legend quotes the note verbatim, so a substring search over the whole
    // document matches the explanation instead of the note. Anchor on the line
    // start: the note is a blockquote, the legend bullet begins with `- A `.
    t.false(/^> The same code appears in /m.test(md));
});

// --- trailing sections --------------------------------------------------

test('buildReport lists fully covered files', t => {
    const file = /** @type {any} */ (
        fixtureFile({ displayPath: 'src/clean.js', sourceLines: ['a'], gaps: [] })
    );
    file.totals = {
        statements: { covered: 1, total: 1 },
        branches: { covered: 0, total: 0 },
        functions: { covered: 0, total: 0 },
    };

    const md = buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'coverage/coverage-final.json',
        scopeText: 'all files · 1 file',
        files: [file],
        labeled: [],
        totals: sumTotals([file]),
        contextLines: 1,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
    });

    t.true(md.includes('## Fully covered files'));
    t.true(md.includes('- `src/clean.js` —'));
});

test('buildReport omits the fully covered section when nothing is clean', t => {
    t.false(render().includes('## Fully covered files'));
});

test('buildReport says so when nothing is uncovered', t => {
    const file = /** @type {any} */ (
        fixtureFile({ displayPath: 'src/clean.js', sourceLines: ['a'], gaps: [] })
    );

    const md = buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'coverage/coverage-final.json',
        scopeText: 'all files · 1 file',
        files: [file],
        labeled: [],
        totals: sumTotals([file]),
        contextLines: 1,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
    });

    t.true(md.includes('No uncovered lines, branches or functions were found'));
});

test('buildReport: a never-called function cites its region, and two use the plural', t => {
    // Spans longer than MIN_FUNCTION_SPAN (8): a shorter one is not used as a
    // snippet window, `win.fn` stays null, and the "see G…" path becomes
    // unreachable — which is how the first version of this test asserted a
    // string the renderer could not produce.
    const file = fixtureFile({
        displayPath: 'src/a.js',
        sourceLines: linesOf(30),
        functions: [
            { name: 'printed', startLine: 2, endLine: 20, declLine: 2 },
            { name: 'silent', startLine: 22, endLine: 30, declLine: 22 },
        ],
        gaps: [blockGap(9, 9)],
        uncoveredFunctions: [
            { name: 'printed', line: 2 },
            { name: 'silent', line: 22 },
        ],
    });

    const md = buildReport({
        title: 'Coverage gaps',
        reportDisplay: 'r.json',
        scopeText: 'all files · 1 file',
        files: [file],
        labeled: assignLabels([file]),
        totals: sumTotals([file]),
        contextLines: 0,
        maxLines: 80,
        highlight: 'comment',
        provenance: { revision: null, dirty: [], generated: null },
        freshness: { reportTime: null, stale: [], checked: 0 },
    });

    const neverCalled = md.split('\n').find(line => line.startsWith('Never called:'));
    const gaps = md.split('\n').find(line => line.startsWith('Gaps:'));

    // One fact per assertion: the citation, the no-snippet wording, the plural,
    // and the arithmetic. A single `includes` of all four at once would say
    // "false" without saying which part disagreed.
    t.regex(neverCalled, /`printed` \(line 2\) — see G1/);
    t.regex(neverCalled, /`silent` \(line 22\) — nothing to print/);
    t.regex(gaps, /2 never-called functions/);
    t.regex(gaps, /^Gaps: 3 \(1 line blocks, 0 branches, 2 never-called functions\)$/);
});
