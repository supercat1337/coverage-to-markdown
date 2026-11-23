// @ts-check

/**
 * Unit tests for the `cov2md` modules: ranges, fences, highlight, markdown,
 * paths and the argument validators.
 *
 * Everything here is a pure function or a guard over a temp directory — no
 * CLI process is spawned, so a failure names the module, not the shell.
 */

import test from 'ava';
import { join } from 'node:path';

import {
    CLI_OPTIONS,
    parseContextOption,
    parseHighlightOption,
    readRequiredFlags,
    rejectPositionals,
} from '../src/cov2md/args.js';
import { EXTENSION_TO_FENCE, detectFenceLanguage, pickFenceLength } from '../src/cov2md/fences.js';
import {
    VALID_HIGHLIGHTS,
    renderSnippet,
    renderSnippetComment,
    renderSnippetGutter,
    renderSnippetNone,
} from '../src/cov2md/highlight.js';
import { DEFAULT_CONTEXT_LINES, buildMarkdown, splitLines } from '../src/cov2md/markdown.js';
import {
    basenameOf,
    guardFilePaths,
    guardOutputDirectory,
    toDisplayPath,
} from '../src/cov2md/paths.js';
import { normalizeRanges, parseRanges } from '../src/cov2md/ranges.js';
import { tmpDir, writeFile } from './_helpers.js';

// --- ranges -------------------------------------------------------------

test('parseRanges parses ranges and single lines', t => {
    t.deepEqual(parseRanges('176-181,305'), [
        { start: 176, end: 181 },
        { start: 305, end: 305 },
    ]);
});

test('parseRanges ignores whitespace and empty segments', t => {
    t.deepEqual(parseRanges(' 1 - 5 ,, 7 ,'), [
        { start: 1, end: 5 },
        { start: 7, end: 7 },
    ]);
});

test('parseRanges returns an empty array for empty input', t => {
    t.deepEqual(parseRanges(''), []);
});

test('parseRanges rejects non-numeric line numbers', t => {
    t.throws(() => parseRanges('a-b'), { message: /Invalid line number: "a"/ });
    t.throws(() => parseRanges('0'), { message: /Invalid line number: "0"/ });
    t.throws(() => parseRanges('1.5'), { message: /Invalid line number: "1.5"/ });
});

test('parseRanges rejects a reversed range', t => {
    t.throws(() => parseRanges('5-3'), { message: /end < start/ });
});

test('normalizeRanges sorts, merges overlaps and joins adjacent ranges', t => {
    t.deepEqual(
        normalizeRanges([
            { start: 5, end: 7 },
            { start: 8, end: 10 },
            { start: 15, end: 15 },
            { start: 1, end: 3 },
            { start: 2, end: 6 },
        ]),
        [
            { start: 1, end: 10 },
            { start: 15, end: 15 },
        ]
    );
});

test('normalizeRanges keeps a one-line hole between ranges', t => {
    t.deepEqual(
        normalizeRanges([
            { start: 1, end: 2 },
            { start: 4, end: 5 },
        ]),
        [
            { start: 1, end: 2 },
            { start: 4, end: 5 },
        ]
    );
});

test('normalizeRanges does not mutate its input', t => {
    const input = [
        { start: 5, end: 6 },
        { start: 1, end: 5 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    normalizeRanges(input);
    t.deepEqual(input, snapshot);
});

test('normalizeRanges tolerates empty and non-array input', t => {
    t.deepEqual(normalizeRanges([]), []);
    t.deepEqual(normalizeRanges(/** @type {any} */ (null)), []);
    t.deepEqual(normalizeRanges(/** @type {any} */ (undefined)), []);
});

// --- fences -------------------------------------------------------------

test('detectFenceLanguage maps extensions case-insensitively', t => {
    t.is(detectFenceLanguage('src/a.js'), 'js');
    t.is(detectFenceLanguage('src/a.TS'), 'ts');
    t.is(detectFenceLanguage('src/a.tsx'), 'tsx');
    t.is(detectFenceLanguage('src/a.py'), 'python');
});

test('detectFenceLanguage handles Windows separators', t => {
    t.is(detectFenceLanguage('C:\\foo\\bar.py'), 'python');
    t.is(detectFenceLanguage('C:\\foo\\bar.JS'), 'js');
});

test('detectFenceLanguage returns an empty string for unknown extensions', t => {
    t.is(detectFenceLanguage('file.unknownext'), '');
    t.is(detectFenceLanguage('Makefile'), '');
    t.is(detectFenceLanguage('.gitignore'), '');
});

test('EXTENSION_TO_FENCE agrees with detectFenceLanguage', t => {
    for (const [ext, lang] of Object.entries(EXTENSION_TO_FENCE)) {
        t.is(detectFenceLanguage('file' + ext), lang, ext);
    }
});

test('pickFenceLength never goes below three backticks', t => {
    t.is(pickFenceLength(['a', 'b'], 1, 2), 3);
});

test('pickFenceLength grows past the longest backtick run', t => {
    t.is(pickFenceLength(['a ```js', 'b'], 1, 2), 4);
    t.is(pickFenceLength(['``````', 'x'], 1, 2), 7);
});

test('pickFenceLength only inspects the requested window', t => {
    t.is(pickFenceLength(['```', 'x', 'y'], 2, 3), 3);
});

test('pickFenceLength clamps to the available lines', t => {
    t.is(pickFenceLength([], 1, 5), 3);
    t.is(pickFenceLength(['```'], 0, 99), 4);
});

// --- highlight ----------------------------------------------------------

const LINES = ['alpha', 'beta', 'gamma'];

test('VALID_HIGHLIGHTS lists the three modes', t => {
    t.deepEqual(VALID_HIGHLIGHTS, ['none', 'comment', 'gutter']);
});

test('renderSnippetNone appends a plain line-number comment', t => {
    t.is(renderSnippetNone(LINES, 1, 3), 'alpha // 1\nbeta // 2\ngamma // 3');
});

test('renderSnippetComment marks only the uncovered range', t => {
    t.is(
        renderSnippetComment(LINES, { start: 2, end: 2 }, 1, 3),
        'alpha // 1\nbeta // 2 ← UNCOVERED\ngamma // 3'
    );
});

test('renderSnippetGutter marks uncovered lines and aligns numbers', t => {
    t.is(
        renderSnippetGutter(LINES, { start: 2, end: 2 }, 1, 3),
        '  1 │ alpha\n> 2 │ beta\n  3 │ gamma'
    );
});

test('renderSnippetGutter pads to the widest line number', t => {
    const lines = Array.from({ length: 11 }, (_unused, index) => 'l' + (index + 1));

    t.is(
        renderSnippetGutter(lines, { start: 10, end: 10 }, 9, 11),
        '   9 │ l9\n> 10 │ l10\n  11 │ l11'
    );
});

test('renderSnippet dispatches on the mode', t => {
    const range = { start: 1, end: 1 };
    t.is(renderSnippet(LINES, range, 1, 1, 'none'), 'alpha // 1');
    t.is(renderSnippet(LINES, range, 1, 1, 'gutter'), '> 1 │ alpha');
    t.is(renderSnippet(LINES, range, 1, 1, 'comment'), 'alpha // 1 ← UNCOVERED');
});

test('renderSnippet falls back to the comment mode on an unknown value', t => {
    const range = { start: 1, end: 1 };
    t.is(renderSnippet(LINES, range, 1, 1, /** @type {any} */ ('diff')), 'alpha // 1 ← UNCOVERED');
});

test('renderSnippetNone tolerates lines beyond the end of the file', t => {
    t.is(renderSnippetNone(['a'], 1, 2), 'a // 1\n // 2');
});

// --- markdown -----------------------------------------------------------

test('the default context is two lines', t => {
    t.is(DEFAULT_CONTEXT_LINES, 2);
});

test('splitLines strips trailing carriage returns', t => {
    t.deepEqual(splitLines('a\r\nb\r\n'), ['a', 'b', '']);
});

test('buildMarkdown renders the documented document shape', t => {
    const md = buildMarkdown('src/x.js', ['a();', 'b();', 'c();'], [{ start: 2, end: 2 }]);

    const expected = [
        '# Coverage: x.js',
        '',
        'Source: `src/x.js`',
        '',
        '1 range · one contiguous uncovered block each · sorted by line',
        'Labels R1..RN are assigned per run and may change when lines shift.',
        '',
        '## R1 · line 2',
        '',
        '```js',
        'a(); // 1',
        'b(); // 2 ← UNCOVERED',
        'c(); // 3',
        '```',
        '',
    ].join('\n');

    t.is(md, expected);
});

test('buildMarkdown merges ranges before rendering', t => {
    const md = buildMarkdown(
        'src/x.js',
        ['1', '2', '3', '4', '5'],
        [
            { start: 2, end: 2 },
            { start: 3, end: 3 },
        ],
        { contextLines: 0 }
    );

    t.true(md.includes('1 range ·'));
    t.true(md.includes('## R1 · lines 2–3'));
    t.false(md.includes('## R2'));
});

test('buildMarkdown honours context 0 and a custom title', t => {
    const md = buildMarkdown('src/x.js', ['1', '2', '3', '4', '5'], [{ start: 3, end: 3 }], {
        contextLines: 0,
        title: 'My notes',
    });

    t.true(md.startsWith('# My notes\n'));
    t.true(md.includes('```js\n3 // 3 ← UNCOVERED\n```'));
});

test('buildMarkdown overrides the fence language', t => {
    const md = buildMarkdown('src/x.py', ['x'], [{ start: 1, end: 1 }], { fence: 'python' });
    t.true(md.includes('```python\n'));
});

test('buildMarkdown can disable the fence language', t => {
    const md = buildMarkdown('src/x.js', ['x'], [{ start: 1, end: 1 }], { fence: '' });
    t.true(md.includes('```\nx // 1 ← UNCOVERED'));
});

test('buildMarkdown sanitises the reproduce command', t => {
    const md = buildMarkdown('src/x.js', ['x'], [{ start: 1, end: 1 }], {
        command: 'npm test &&\nnpx c8 `report`',
    });

    t.true(md.includes("Reproduce: `npm test && npx c8 'report'`"));
});

test('buildMarkdown omits Reproduce for an empty command', t => {
    const md = buildMarkdown('src/x.js', ['x'], [{ start: 1, end: 1 }], { command: '' });
    t.false(md.includes('Reproduce:'));
});

test('buildMarkdown grows the fence when the snippet contains backticks', t => {
    const md = buildMarkdown('src/x.md', ['a', '```', 'b'], [{ start: 2, end: 2 }], {
        contextLines: 0,
    });

    t.true(md.includes('````markdown'));
});

test('buildMarkdown renders an empty fence for out-of-bounds ranges', t => {
    const md = buildMarkdown('src/x.js', ['a'], [{ start: 10, end: 12 }], { contextLines: 0 });
    t.true(md.includes('## R1 · lines 10–12'));
    t.true(md.includes('```js\n```'));
});

test('buildMarkdown validates contextLines', t => {
    t.throws(() => buildMarkdown('a.js', ['x'], [], { contextLines: -1 }), {
        message: /Invalid contextLines: -1/,
    });
    t.throws(() => buildMarkdown('a.js', ['x'], [], { contextLines: 1.5 }), {
        message: /Invalid contextLines/,
    });
});

test('buildMarkdown validates the highlight mode', t => {
    t.throws(() => buildMarkdown('a.js', ['x'], [{ start: 1, end: 1 }], { highlight: 'diff' }), {
        message: /Invalid highlight mode: "diff"\. Expected one of: none, comment, gutter\./,
    });
});

// --- paths --------------------------------------------------------------

test('basenameOf handles both separator styles', t => {
    t.is(basenameOf('/a/b/c.js'), 'c.js');
    t.is(basenameOf('C:\\a\\b.js'), 'b.js');
    t.is(basenameOf('file.js'), 'file.js');
    t.is(basenameOf('/a/b/'), '');
});

test('toDisplayPath prints a path relative to the cwd with forward slashes', t => {
    const shown = toDisplayPath(join(process.cwd(), 'src', 'a.js'));
    t.is(shown, 'src/a.js');
    t.false(shown.includes('\\'));
});

test('toDisplayPath keeps an absolute path for the cwd itself', t => {
    const shown = toDisplayPath(process.cwd());
    t.true(shown.length > 0);
    t.false(shown.includes('\\'));
});

test('toDisplayPath keeps ../ paths for files outside the cwd', t => {
    const shown = toDisplayPath(join(process.cwd(), '..', 'outside.js'));
    t.true(shown.startsWith('..'));
});

test('guardFilePaths rejects the same input and output path', t => {
    t.throws(() => guardFilePaths('/a/b.js', '/a/b.js', true), { message: /different files/ });
});

test('guardFilePaths rejects a missing input', t => {
    const dir = tmpDir(t);
    t.throws(() => guardFilePaths(join(dir, 'nope.js'), join(dir, 'out.md'), false), {
        message: /Input file not found/,
    });
});

test('guardFilePaths rejects a directory as input', t => {
    const dir = tmpDir(t);
    t.throws(() => guardFilePaths(dir, join(dir, 'out.md'), false), {
        message: /not a regular file/,
    });
});

test('guardFilePaths refuses to overwrite without force', t => {
    const dir = tmpDir(t);
    const input = writeFile(dir, 'a.js', 'x');
    const output = writeFile(dir, 'out.md', 'old');

    t.throws(() => guardFilePaths(input, output, false), { message: /already exists/ });
    t.notThrows(() => guardFilePaths(input, output, true));
});

test('guardFilePaths accepts a fresh output path', t => {
    const dir = tmpDir(t);
    const input = writeFile(dir, 'a.js', 'x');
    t.notThrows(() => guardFilePaths(input, join(dir, 'out.md'), false));
});

test('guardOutputDirectory requires an existing directory', t => {
    const dir = tmpDir(t);
    t.throws(() => guardOutputDirectory(join(dir, 'missing', 'out.md')), {
        message: /Output directory does not exist/,
    });
    t.notThrows(() => guardOutputDirectory(join(dir, 'out.md')));
});

// --- arguments ----------------------------------------------------------

test('CLI_OPTIONS declares the documented flags', t => {
    for (const name of [
        'ranges',
        'input',
        'output',
        'context',
        'title',
        'fence',
        'highlight',
        'command',
        'force',
        'quiet',
        'absolute-path',
        'help',
        'version',
    ]) {
        t.true(Object.hasOwn(CLI_OPTIONS, name), name);
    }
});

test('parseContextOption accepts non-negative integers', t => {
    t.is(parseContextOption('0'), 0);
    t.is(parseContextOption('10'), 10);
});

test('parseContextOption rejects everything else', t => {
    for (const raw of ['-1', '1.5', 'abc', '2px']) {
        t.throws(() => parseContextOption(raw), { message: /Invalid --context value/ });
    }
});

test('parseHighlightOption accepts the three modes', t => {
    for (const mode of VALID_HIGHLIGHTS) {
        t.is(parseHighlightOption(mode), mode);
    }
});

test('parseHighlightOption rejects an unknown mode', t => {
    t.throws(() => parseHighlightOption('diff'), { message: /Invalid --highlight value: "diff"/ });
});

test('rejectPositionals tolerates an empty list', t => {
    t.notThrows(() => rejectPositionals([]));
});

test('rejectPositionals refuses stray arguments', t => {
    t.throws(() => rejectPositionals(['a.js']), {
        message: /Unexpected positional argument\(s\): a\.js/,
    });
});

test('readRequiredFlags returns the three required values', t => {
    t.deepEqual(readRequiredFlags({ ranges: '1-2', input: 'a.js', output: 'b.md' }), {
        ranges: '1-2',
        input: 'a.js',
        output: 'b.md',
    });
});

test('readRequiredFlags coerces non-string values', t => {
    t.deepEqual(readRequiredFlags({ ranges: 1, input: 2, output: 3 }), {
        ranges: '1',
        input: '2',
        output: '3',
    });
});

test('readRequiredFlags reports every missing flag', t => {
    t.throws(() => readRequiredFlags({}), { message: /--ranges, --input, --output/ });
    t.throws(() => readRequiredFlags({ ranges: '1' }), { message: /--input, --output/ });
});

test('buildMarkdown uses the plural noun for several ranges', t => {
    const md = buildMarkdown(
        'a.js',
        ['1', '2', '3', '4', '5'],
        [
            { start: 1, end: 1 },
            { start: 4, end: 4 },
        ],
        { contextLines: 0 }
    );

    t.true(md.includes('2 ranges ·'));
});

test('renderSnippetComment tolerates a window past the end of the array', t => {
    t.is(renderSnippetComment(['a'], { start: 1, end: 1 }, 1, 2), 'a // 1 ← UNCOVERED\n // 2');
});

test('renderSnippetGutter tolerates a window past the end of the array', t => {
    t.is(renderSnippetGutter(['a'], { start: 1, end: 1 }, 1, 2), '> 1 │ a\n  2 │ ');
});

test('normalizeRanges breaks a start tie by end', t => {
    // Two ranges can start on the same line; the sort must still be total,
    // otherwise the merge below depends on the input order.
    t.deepEqual(
        normalizeRanges([
            { start: 3, end: 9 },
            { start: 3, end: 5 },
        ]),
        [{ start: 3, end: 9 }]
    );
});
