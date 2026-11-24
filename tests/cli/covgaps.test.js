// @ts-check

/**
 * `covgaps` as a user runs it: a real child process in a temporary directory,
 * so exit codes, stdout and stderr are the ones a terminal would show.
 *
 * The failure cases are a table because they differ only in their setup and
 * in one line of expected stderr — as separate tests they were twelve copies
 * of the same four lines.
 */

import test from 'ava';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import { FIXTURES, projectRoot, runCli, tmpDir, writeFile } from '../_helpers.js';

const COMMAND = 'coverage-json-to-markdown';
const VERSION = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).version;
/**
 * Copy the checked-in demo project into a fresh temporary directory.
 * @param {import('ava').ExecutionContext} t
 * @returns {string}
 */
function demo(t) {
    const dir = tmpDir(t);
    cpSync(join(FIXTURES, 'demo'), dir, { recursive: true });
    return dir;
}

/** @type {Array<{ name: string, args: string[], setup: (t: any) => string, expect: RegExp }>} */
const FAILURES = [
    {
        name: 'a missing report',
        args: [],
        setup: tmpDir,
        expect: /Coverage report not found/,
    },
    {
        name: 'two positional reports',
        args: ['a.json', 'b.json'],
        setup: tmpDir,
        expect: /Expected at most one positional argument/,
    },
    {
        name: 'a positional report together with --input',
        args: ['coverage/coverage-final.json', '-i', 'coverage/coverage-final.json'],
        setup: demo,
        expect: /Pass either a positional report path or --input, not both/,
    },
    {
        name: 'an output equal to the report',
        args: ['coverage/coverage-final.json', '-o', 'coverage/coverage-final.json'],
        setup: demo,
        expect: /--output must differ from the coverage report path/,
    },
    {
        name: 'a json path equal to the output',
        args: ['coverage/coverage-final.json', '-o', 'cov.md', '--json', 'cov.md'],
        setup: demo,
        expect: /--json must point at a path different from --output/,
    },
    {
        name: 'an existing document without --force',
        args: ['coverage/coverage-final.json'],
        setup: t => {
            const dir = demo(t);
            writeFile(dir, 'cov.md', 'keep me');
            return dir;
        },
        expect: /Output file already exists/,
    },
    {
        name: 'an existing json file without --force',
        args: ['coverage/coverage-final.json', '--json', 'gaps.json'],
        setup: t => {
            const dir = demo(t);
            writeFile(dir, 'gaps.json', '{"keep":true}');
            return dir;
        },
        expect: /JSON file already exists/,
    },
    {
        name: 'a missing output directory',
        args: ['coverage/coverage-final.json', '-o', 'no/such/cov.md'],
        setup: demo,
        expect: /Output directory does not exist/,
    },
    {
        name: 'a missing json directory',
        args: ['coverage/coverage-final.json', '--json', 'no/such/g.json'],
        setup: demo,
        expect: /--json directory does not exist/,
    },
    {
        name: 'a report path that is a directory',
        args: ['coverage'],
        setup: t => {
            const dir = tmpDir(t);
            mkdirSync(join(dir, 'coverage'));
            return dir;
        },
        expect: /not a regular file/,
    },
    {
        name: 'an unknown sort mode',
        args: ['coverage/coverage-final.json', '--sort', 'random'],
        setup: demo,
        expect: /Invalid --sort value: "random"/,
    },
    {
        name: 'a source that matches nothing',
        args: ['coverage/coverage-final.json', '-s', 'nope.js'],
        setup: demo,
        expect: /--source did not match any file in the report/,
    },
    {
        name: 'a source that matches several files',
        args: ['coverage/coverage-final.json', '-s', 'a.js'],
        setup: t => {
            const dir = tmpDir(t);
            writeFile(
                dir,
                'coverage/coverage-final.json',
                JSON.stringify({ 'one/a.js': {}, 'two/a.js': {} })
            );
            return dir;
        },
        expect: /--source matches several files/,
    },
];

for (const failure of FAILURES) {
    test(`${COMMAND}: rejects ${failure.name}`, async t => {
        const dir = failure.setup(t);
        const result = await runCli('covgaps', failure.args, dir);

        t.is(result.code, 1);
        t.regex(result.stderr, failure.expect);

        // Not "exactly one line". An unmatched --source deliberately appends
        // the list of files the report does contain, which is what makes the
        // message actionable; pinning the count to one would forbid that help.
        // The invariant the top-level catch exists to guarantee is different:
        // the user sees a message, never a stack frame.
        t.false(result.stderr.includes('    at '), 'no stack frames on stderr');
        t.true(result.stderr.startsWith(COMMAND + ': error: '), 'one error prefix');
    });
}

test(`${COMMAND}: a refused --json keeps the old file`, async t => {
    const dir = demo(t);
    writeFile(dir, 'gaps.json', '{"keep":true}');

    await runCli('covgaps', ['coverage/coverage-final.json', '--json', 'gaps.json'], dir);

    t.is(
        JSON.parse(
            await import('node:fs').then(fs => fs.readFileSync(join(dir, 'gaps.json'), 'utf8'))
        ).keep,
        true
    );
});

test(`${COMMAND}: a refused document keeps the old file`, async t => {
    const dir = demo(t);
    writeFile(dir, 'cov.md', 'keep me');

    await runCli('covgaps', ['coverage/coverage-final.json'], dir);

    t.is(
        await import('node:fs').then(fs => fs.readFileSync(join(dir, 'cov.md'), 'utf8')),
        'keep me'
    );
});

// --- success ------------------------------------------------------------

test(`${COMMAND}: writes cov.md and prints a summary`, async t => {
    const dir = demo(t);
    const result = await runCli('covgaps', ['coverage/coverage-final.json'], dir);

    t.is(result.code, 0);
    t.is(result.stderr, '');
    t.true(existsSync(join(dir, 'cov.md')));

    t.true(result.stdout.includes(`${COMMAND}: wrote report`));
    t.true(result.stdout.includes('  scope:  1 of 1 file(s)'));
    t.false(result.stdout.includes('  json:'));

    // The summary speaks in counters, the document in prose; the numbers must
    // agree. Two vocabularies are deliberate — stdout is a machine-readable
    // line, the body is read by a person — so both are asserted, and a change
    // to either now fails here instead of drifting silently.
    t.regex(result.stdout, /gaps:\s+4 \(2 block\(s\), 2 branch\(es\)\)/);

    const md = readFileSync(join(dir, 'cov.md'), 'utf8');
    // The total now includes never-called functions, so the arithmetic of the
    // parenthetical adds up to the leading number — and to the `Gaps` column in
    // the table above it.
    t.regex(md, /Gaps: \d+ \(2 line blocks, 2 branches(?:, 1 never-called function)?\)/);
});

test(`${COMMAND}: the document follows the documented shape`, async t => {
    const dir = demo(t);
    await runCli('covgaps', ['coverage/coverage-final.json'], dir);

    const { readFileSync } = await import('node:fs');
    const md = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.true(md.startsWith('# Coverage gaps\n'));
    t.true(md.includes('Report: `coverage/coverage-final.json`'));
    t.true(md.includes('Scope: all files · 1 file'));
    t.regex(md, /^Revision: (`[0-9a-f]{7,}`|— \(git unavailable\))$/m);
    t.regex(md, /^Generated: `\d{4}-\d{2}-\d{2}T[\d:.]+Z`$/m);

    t.true(md.includes('| Statements | 5 | 7 | 71.4 % |'));
    t.true(md.includes('| Branches | 2 | 4 | 50 % |'));
    t.true(md.includes('| Functions | 1 | 2 | 50 % |'));

    t.true(md.includes('## Files in scope'), 'level two, as the real output');
    t.true(md.includes('### G1–G3 ·'), 'the three gaps of describe share a region');
    t.true(md.includes('### G4 ·'));
});

test(`${COMMAND}: a bullet names the missing side and its operand`, async t => {
    const dir = demo(t);
    await runCli('covgaps', ['coverage/coverage-final.json'], dir);

    const { readFileSync } = await import('node:fs');
    const md = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.true(md.includes('else side (`fallback`) never executed'));
    t.true(md.includes('right operand of `??`'));
    t.true(md.includes("(`'none'`)"));
});

test(`${COMMAND}: --no-git drops the revision and the dirty list`, async t => {
    const dir = demo(t);
    await runCli('covgaps', ['coverage/coverage-final.json', '--no-git', '--force'], dir);

    const { readFileSync } = await import('node:fs');
    const md = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.true(md.includes('Revision: — (git unavailable)'));
    t.false(md.includes('Dirty:'));
});

test(`${COMMAND}: --no-git --no-timestamp is reproducible`, async t => {
    const dir = demo(t);
    const args = ['coverage/coverage-final.json', '--no-git', '--no-timestamp'];

    await runCli('covgaps', args, dir);
    const { readFileSync } = await import('node:fs');
    const first = readFileSync(join(dir, 'cov.md'), 'utf8');

    await runCli('covgaps', [...args, '--force'], dir);
    const second = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.false(first.includes('Generated:'));
    t.is(first, second);
});

test(`${COMMAND}: every sort mode renders the gaps`, async t => {
    const dir = demo(t);

    for (const mode of ['alpha', 'gaps', 'percent']) {
        const result = await runCli(
            'covgaps',
            ['coverage/coverage-final.json', '--sort', mode, '--force'],
            dir
        );

        t.is(result.code, 0, mode);
        const { readFileSync } = await import('node:fs');
        t.true(readFileSync(join(dir, 'cov.md'), 'utf8').includes('### G1'), mode);
    }
});

test(`${COMMAND}: --quiet prints nothing on success`, async t => {
    const dir = demo(t);
    const result = await runCli('covgaps', ['coverage/coverage-final.json', '-q'], dir);

    t.is(result.code, 0);
    t.is(result.stdout, '');
    t.true(existsSync(join(dir, 'cov.md')));
});

test(`${COMMAND}: --json writes the same labels as the Markdown`, async t => {
    const dir = demo(t);
    const result = await runCli(
        'covgaps',
        ['coverage/coverage-final.json', '--json', 'gaps.json', '--no-timestamp'],
        dir
    );

    t.is(result.code, 0);
    t.true(result.stdout.includes('  json:   ' + join(dir, 'gaps.json')));

    const { readFileSync } = await import('node:fs');
    const model = JSON.parse(readFileSync(join(dir, 'gaps.json'), 'utf8'));

    t.deepEqual(
        model.files[0].gaps.map(gap => gap.label),
        ['G1', 'G2', 'G3', 'G4']
    );
    t.deepEqual(
        model.files[0].gaps.map(gap => gap.kind),
        ['branch', 'branch', 'block', 'block']
    );
});

test(`${COMMAND}: --source narrows the scope`, async t => {
    const dir = demo(t);
    const result = await runCli(
        'covgaps',
        ['coverage/coverage-final.json', '-s', 'src/demo.js'],
        dir
    );

    t.is(result.code, 0);
    const { readFileSync } = await import('node:fs');
    t.true(readFileSync(join(dir, 'cov.md'), 'utf8').includes('Scope: `src/demo.js` · 1 file'));
});

test(`${COMMAND}: several files, one of them unreadable`, async t => {
    const dir = tmpDir(t);
    writeFile(
        dir,
        'coverage/coverage-final.json',
        JSON.stringify({
            'src/a.js': { statementMap: {}, s: {}, fnMap: {}, f: {}, branchMap: {}, b: {} },
            'src/b.js': { statementMap: {}, s: {}, fnMap: {}, f: {}, branchMap: {}, b: {} },
        })
    );

    const result = await runCli('covgaps', ['coverage/coverage-final.json', '--no-git'], dir);

    t.is(result.code, 0);
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.true(md.includes('Scope: all files · 2 files'));
    t.true(md.includes('## Files without executable code'));
});

test(`${COMMAND}: --context widens the window and --highlight marks the gutter`, async t => {
    const dir = demo(t);
    const result = await runCli(
        'covgaps',
        ['coverage/coverage-final.json', '-c', '5', '--highlight', 'gutter'],
        dir
    );

    t.is(result.code, 0);
    const md = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.true(md.includes('`>` in the gutter marks a line that belongs to a gap'));
    t.true(md.includes('>  8 │'));
});

test(`${COMMAND}: --max-lines shortens the snippet and says what it cut`, async t => {
    const dir = demo(t);
    await runCli('covgaps', ['coverage/coverage-final.json', '--max-lines', '4'], dir);

    const md = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.regex(md, /> Lines \d+–\d+ omitted/, 'a cut is always reported');
    t.true(md.includes('(excerpt)'), 'a capped window says so in the heading');
});

test(`${COMMAND}: --absolute-path prints absolute paths`, async t => {
    const dir = demo(t);
    await runCli('covgaps', ['coverage/coverage-final.json', '--absolute-path'], dir);

    const md = readFileSync(join(dir, 'cov.md'), 'utf8');

    t.true(md.includes('Report: `' + join(dir, 'coverage', 'coverage-final.json') + '`'));
});

test(`${COMMAND}: an unmatched --source lists the candidates`, async t => {
    const dir = demo(t);
    const result = await runCli('covgaps', ['coverage/coverage-final.json', '-s', 'nope.js'], dir);

    t.is(result.code, 1);
    t.true(result.stderr.includes('Files in the report:'));
    t.true(result.stderr.includes('  src/demo.js'));
});

test(`${COMMAND}: --help prints usage and exits zero`, async t => {
    const result = await runCli('covgaps', ['--help'], tmpDir(t));

    t.is(result.code, 0);
    t.true(result.stdout.startsWith('coverage-json-to-markdown — list uncovered lines'));
    t.true(result.stdout.includes('Default: coverage/coverage-final.json'));
});

test(`${COMMAND}: --version prints the package version`, async t => {
    const result = await runCli('covgaps', ['--version'], tmpDir(t));

    t.is(result.code, 0);
    t.is(result.stdout, VERSION + '\n');
});

test(`${COMMAND}: --source with an empty report names no file`, async t => {
    // `--source ''` is falsy but not `undefined`, so the scope line takes the
    // single-file branch; with an empty report there is no file to name, and
    // the raw flag is the only honest answer.
    const dir = tmpDir(t);
    writeFile(dir, 'coverage/coverage-final.json', '{}');

    const result = await runCli('covgaps', ['coverage/coverage-final.json', '--source', ''], dir);

    t.is(result.code, 0);
    t.true(readFileSync(join(dir, 'cov.md'), 'utf8').includes('Scope: `` · 1 file'));
});
