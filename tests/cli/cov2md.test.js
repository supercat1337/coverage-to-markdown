// @ts-check

/**
 * `cov2md` as a user runs it: a child process in a temporary directory, so the
 * exit code and both streams are the ones a terminal would show.
 *
 * Same contract as `cli/covgaps.test.js`. The nine refusals are a table — they
 * differ only in the fixture and in one line of expected stderr.
 */

import test from 'ava';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { projectRoot, runCli, tmpDir, writeFile } from '../_helpers.js';

const COMMAND = 'coverage-to-markdown';
const VERSION = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).version;
const SOURCE = 'l1\nl2\nl3\nl4\n';

/**
 * A temporary directory with `src/a.js` written.
 * @param {import('ava').ExecutionContext} t
 * @returns {string}
 */
function project(t) {
    const dir = tmpDir(t);
    writeFile(dir, 'src/a.js', SOURCE);
    return dir;
}

// --- surface ------------------------------------------------------------

test(`${COMMAND}: --help prints usage and exits zero`, async t => {
    const result = await runCli('cov2md', ['--help'], tmpDir(t));

    t.is(result.code, 0);
    t.is(result.stderr, '');
    t.true(result.stdout.startsWith('coverage-to-markdown — convert coverage ranges'));
    t.true(result.stdout.includes('--ranges <ranges>'));
    t.true(result.stdout.includes('All arguments must be named.'));
});

test(`${COMMAND}: --version prints the package version`, async t => {
    const result = await runCli('cov2md', ['--version'], tmpDir(t));

    t.is(result.code, 0);
    t.is(result.stdout, VERSION + '\n');
});

// --- refusals -----------------------------------------------------------

/** @type {Array<{ name: string, args: string[], setup: (t: any) => string, expect: RegExp }>} */
const FAILURES = [
    {
        name: 'an empty command line',
        args: [],
        setup: tmpDir,
        expect: /Missing required argument\(s\): --ranges, --input, --output/,
    },
    {
        name: 'only some of the required flags',
        args: ['-r', '1-2', '-i', 'src/a.js'],
        setup: project,
        expect: /Missing required argument\(s\): --output/,
    },
    {
        name: 'a positional argument',
        args: ['-r', '1-2', '-i', 'src/a.js', '-o', 'out.md', 'extra'],
        setup: project,
        expect: /Unexpected positional argument\(s\): extra/,
    },
    {
        name: 'an existing output without --force',
        args: ['-r', '1', '-i', 'src/a.js', '-o', 'out.md'],
        setup: t => {
            const dir = project(t);
            writeFile(dir, 'out.md', 'keep me');
            return dir;
        },
        expect: /Output file already exists[\s\S]*Pass --force to overwrite it\./,
    },
    {
        name: 'identical input and output',
        args: ['-r', '1', '-i', 'src/a.js', '-o', 'src/a.js', '-f'],
        setup: project,
        expect: /--input and --output must point at different files\./,
    },
    {
        name: 'a missing input file',
        args: ['-r', '1', '-i', 'nope.js', '-o', 'out.md'],
        setup: tmpDir,
        expect: /Input file not found/,
    },
    {
        name: 'a missing output directory',
        args: ['-r', '1', '-i', 'src/a.js', '-o', 'no/such/out.md'],
        setup: project,
        expect: /Output directory does not exist/,
    },
    {
        name: 'an invalid range',
        args: ['-r', 'x-y', '-i', 'src/a.js', '-o', 'out.md'],
        setup: project,
        expect: /Invalid line number: "x"/,
    },
    {
        name: 'a range string that yields nothing',
        args: ['-r', ' , , ', '-i', 'src/a.js', '-o', 'out.md'],
        setup: project,
        expect: /--ranges produced no ranges/,
    },
];

for (const failure of FAILURES) {
    test(`${COMMAND}: refuses ${failure.name}`, async t => {
        const dir = failure.setup(t);
        const result = await runCli('cov2md', failure.args, dir);

        t.is(result.code, 1);
        t.regex(result.stderr, failure.expect);
        t.false(result.stderr.includes('    at '), 'no stack frames on stderr');
        t.true(result.stderr.startsWith(COMMAND + ': error: '), 'one error prefix');
    });
}

test(`${COMMAND}: a refused run keeps the old document`, async t => {
    const dir = project(t);
    writeFile(dir, 'out.md', 'keep me');

    await runCli('cov2md', ['-r', '1', '-i', 'src/a.js', '-o', 'out.md'], dir);

    t.is(readFileSync(join(dir, 'out.md'), 'utf8'), 'keep me');
});

test(`${COMMAND}: a refused run leaves the source untouched`, async t => {
    const dir = project(t);

    await runCli('cov2md', ['-r', '1', '-i', 'src/a.js', '-o', 'src/a.js', '-f'], dir);

    t.is(readFileSync(join(dir, 'src', 'a.js'), 'utf8'), SOURCE);
});

test(`${COMMAND}: an invalid range writes nothing`, async t => {
    const dir = project(t);

    await runCli('cov2md', ['-r', 'x-y', '-i', 'src/a.js', '-o', 'out.md'], dir);

    t.false(existsSync(join(dir, 'out.md')));
});

// --- success ------------------------------------------------------------

test(`${COMMAND}: writes the document and prints a summary`, async t => {
    const dir = project(t);
    const result = await runCli('cov2md', ['-r', '2-3', '-i', 'src/a.js', '-o', 'out.md'], dir);

    t.is(result.code, 0);
    t.is(result.stderr, '');
    t.true(result.stdout.includes(`${COMMAND}: wrote report`));
    t.true(result.stdout.includes('  input:  ' + join(dir, 'src', 'a.js')));
    t.true(result.stdout.includes('  output: ' + join(dir, 'out.md')));
    t.true(result.stdout.includes('  ranges: 1 (from 1 parsed)'));
    t.regex(result.stdout, /size:\s+\d+ bytes/);

    const md = readFileSync(join(dir, 'out.md'), 'utf8');
    t.true(md.startsWith('# Coverage: a.js\n'));
    t.true(md.includes('Source: `src/a.js`'));
    t.true(md.includes('## R1 · lines 2–3'));
    t.true(md.includes('l1 // 1\n'));
    t.false(md.includes('l1 // 1 ← UNCOVERED'));
    t.true(md.includes('l2 // 2 ← UNCOVERED'));
    t.true(md.includes('l3 // 3 ← UNCOVERED'));
    t.true(md.includes('l4 // 4\n'));
});

test(`${COMMAND}: the summary counts parsed ranges before merging`, async t => {
    const dir = project(t);
    const result = await runCli('cov2md', ['-r', '2-3,4', '-i', 'src/a.js', '-o', 'out.md'], dir);

    t.true(result.stdout.includes('  ranges: 1 (from 2 parsed)'));
    t.true(readFileSync(join(dir, 'out.md'), 'utf8').includes('## R1 · lines 2–4'));
});

test(`${COMMAND}: --quiet prints nothing on success`, async t => {
    const dir = project(t);
    const result = await runCli('cov2md', ['-r', '1', '-i', 'src/a.js', '-o', 'out.md', '-q'], dir);

    t.is(result.code, 0);
    t.is(result.stdout, '');
    t.true(existsSync(join(dir, 'out.md')));
});

test(`${COMMAND}: --absolute-path prints the absolute source path`, async t => {
    const dir = project(t);
    await runCli('cov2md', ['-r', '1', '-i', 'src/a.js', '-o', 'out.md', '--absolute-path'], dir);

    t.true(
        readFileSync(join(dir, 'out.md'), 'utf8').includes(
            'Source: `' + join(dir, 'src', 'a.js') + '`'
        )
    );
});

test(`${COMMAND}: renders the gutter mode`, async t => {
    const dir = project(t);
    await runCli(
        'cov2md',
        ['-r', '2', '-i', 'src/a.js', '-o', 'out.md', '-c', '0', '--highlight', 'gutter'],
        dir
    );

    t.true(readFileSync(join(dir, 'out.md'), 'utf8').includes('> 2 │ l2'));
});

test(`${COMMAND}: honours --fence and --title`, async t => {
    const dir = tmpDir(t);
    writeFile(dir, 'src/a.unknownext', SOURCE);

    await runCli(
        'cov2md',
        [
            '-r',
            '1',
            '-i',
            'src/a.unknownext',
            '-o',
            'out.md',
            '--fence',
            'python',
            '-t',
            'Uncovered',
        ],
        dir
    );

    const md = readFileSync(join(dir, 'out.md'), 'utf8');
    t.true(md.startsWith('# Uncovered\n'));
    t.true(md.includes('```python'));
});

test(`${COMMAND}: strips carriage returns from a CRLF source`, async t => {
    const dir = tmpDir(t);
    writeFile(dir, 'src/win.js', 'a();\r\nb();\r\n');

    await runCli('cov2md', ['-r', '2', '-i', 'src/win.js', '-o', 'out.md'], dir);

    const md = readFileSync(join(dir, 'out.md'), 'utf8');
    t.false(md.includes('\r'));
    t.true(md.includes('b(); // 2 ← UNCOVERED'));
});

test(`${COMMAND}: --force overwrites the output`, async t => {
    const dir = project(t);
    writeFile(dir, 'out.md', 'keep me');

    const result = await runCli('cov2md', ['-r', '1', '-i', 'src/a.js', '-o', 'out.md', '-f'], dir);

    t.is(result.code, 0);
    t.true(readFileSync(join(dir, 'out.md'), 'utf8').startsWith('# Coverage: a.js'));
});
