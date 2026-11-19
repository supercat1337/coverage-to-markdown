import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import {
    parseRanges,
    normalizeRanges,
    detectFenceLanguage,
    buildMarkdown,
} from '../src/coverage-to-markdown.js';

/**
 * Escape a string for safe interpolation into a RegExp.
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(moduleDir, '../src/coverage-to-markdown.js');

describe('parseRanges', () => {
    it('parses a single range', () => {
        assert.deepEqual(parseRanges('176-181'), [{ start: 176, end: 181 }]);
    });

    it('parses a single line as start=end', () => {
        assert.deepEqual(parseRanges('305'), [{ start: 305, end: 305 }]);
    });

    it('parses mixed ranges', () => {
        assert.deepEqual(parseRanges('176-181,305,338-344'), [
            { start: 176, end: 181 },
            { start: 305, end: 305 },
            { start: 338, end: 344 },
        ]);
    });

    it('ignores surrounding whitespace', () => {
        assert.deepEqual(parseRanges(' 1-2 , 5 '), [
            { start: 1, end: 2 },
            { start: 5, end: 5 },
        ]);
    });

    it('ignores empty segments', () => {
        assert.deepEqual(parseRanges('1-2,,5,,'), [
            { start: 1, end: 2 },
            { start: 5, end: 5 },
        ]);
    });

    it('parses the example from the docs', () => {
        const example =
            '176-181,258-270,286-287,305,338-344,349-355,370-371,389-390,' +
            '480-481,493-494,527-529,560,571-572,588-589,624-628,638-639,' +
            '688-689,737-738';
        const ranges = parseRanges(example);
        assert.equal(ranges.length, 18);
        assert.deepEqual(ranges[0], { start: 176, end: 181 });
        assert.deepEqual(ranges[ranges.length - 1], { start: 737, end: 738 });
    });

    it('throws on end < start', () => {
        assert.throws(() => parseRanges('5-2'), /end < start/);
    });

    it('throws on zero', () => {
        assert.throws(() => parseRanges('0'), /Invalid line number/);
    });

    it('throws on negative', () => {
        assert.throws(() => parseRanges('-5'), /Invalid line number/);
    });

    it('throws on non-numeric', () => {
        assert.throws(() => parseRanges('abc'), /Invalid line number/);
    });

    it('throws on non-integer', () => {
        assert.throws(() => parseRanges('1.5'), /Invalid line number/);
    });

    it('throws on empty segment between dashes', () => {
        assert.throws(() => parseRanges('5-'), /Invalid line number/);
    });
});

describe('normalizeRanges', () => {
    it('returns empty array for empty input', () => {
        assert.deepEqual(normalizeRanges([]), []);
    });

    it('leaves a single range untouched', () => {
        assert.deepEqual(normalizeRanges([{ start: 5, end: 10 }]), [{ start: 5, end: 10 }]);
    });

    it('merges overlapping ranges', () => {
        assert.deepEqual(
            normalizeRanges([
                { start: 5, end: 10 },
                { start: 8, end: 15 },
            ]),
            [{ start: 5, end: 15 }]
        );
    });

    it('merges directly adjacent ranges', () => {
        assert.deepEqual(
            normalizeRanges([
                { start: 5, end: 7 },
                { start: 8, end: 10 },
            ]),
            [{ start: 5, end: 10 }]
        );
    });

    it('keeps ranges with a gap between them separate', () => {
        assert.deepEqual(
            normalizeRanges([
                { start: 5, end: 7 },
                { start: 9, end: 10 },
            ]),
            [
                { start: 5, end: 7 },
                { start: 9, end: 10 },
            ]
        );
    });

    it('sorts unsorted input', () => {
        assert.deepEqual(
            normalizeRanges([
                { start: 20, end: 25 },
                { start: 1, end: 2 },
            ]),
            [
                { start: 1, end: 2 },
                { start: 20, end: 25 },
            ]
        );
    });

    it('absorbs a fully contained range', () => {
        assert.deepEqual(
            normalizeRanges([
                { start: 5, end: 20 },
                { start: 8, end: 10 },
            ]),
            [{ start: 5, end: 20 }]
        );
    });

    it('merges a chain of overlapping ranges', () => {
        assert.deepEqual(
            normalizeRanges([
                { start: 1, end: 3 },
                { start: 3, end: 5 },
                { start: 5, end: 7 },
            ]),
            [{ start: 1, end: 7 }]
        );
    });
});

describe('detectFenceLanguage', () => {
    const cases = [
        ['file.js', 'js'],
        ['file.mjs', 'js'],
        ['file.ts', 'ts'],
        ['file.tsx', 'tsx'],
        ['file.py', 'python'],
        ['file.go', 'go'],
        ['file.rs', 'rust'],
        ['file.md', 'markdown'],
        ['file.yaml', 'yaml'],
        ['file.toml', 'toml'],
        ['file.sh', 'bash'],
        ['/abs/path/file.js', 'js'],
        ['C:\\foo\\bar.ts', 'ts'],
        ['FILE.JS', 'js'],
        ['file.unknownext', ''],
        ['file', ''],
        ['.gitignore', ''],
    ];

    for (const [filePath, expected] of cases) {
        it(`maps ${filePath} to "${expected}"`, () => {
            assert.equal(detectFenceLanguage(filePath), expected);
        });
    }
});

describe('buildMarkdown', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);

    it('renders a top-level heading with the basename', () => {
        const md = buildMarkdown('/abs/path/file.js', lines, [{ start: 3, end: 4 }]);
        assert.match(md, /^# Coverage: file\.js$/m);
    });

    it('renders the source path', () => {
        const md = buildMarkdown('/abs/path/file.js', lines, [{ start: 3, end: 4 }]);
        assert.match(md, /Source: `\/abs\/path\/file\.js`/);
    });

    it('renders the range count', () => {
        const md = buildMarkdown('/p/f.js', lines, [
            { start: 3, end: 4 },
            { start: 6, end: 6 },
        ]);
        assert.match(md, /Ranges: 2/);
    });

    it('uses the detected fence language', () => {
        const md = buildMarkdown('/p/f.ts', lines, [{ start: 3, end: 4 }]);
        assert.match(md, /^```ts$/m);
    });

    it('honors the fence option override', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 3, end: 4 }], {
            fence: 'python',
        });
        assert.match(md, /^```python$/m);
    });

    it('honors an empty fence override', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 3, end: 4 }], {
            fence: '',
        });
        assert.match(md, /^```$/m);
    });

    it('honors the title option', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 3, end: 4 }], {
            title: 'Uncovered @ abc123',
        });
        assert.match(md, /^# Uncovered @ abc123$/m);
    });

    it('adds two context lines by default', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 5, end: 6 }]);
        assert.match(md, /^line3 \/\/ 3$/m);
        assert.match(md, /^line8 \/\/ 8$/m);
        assert.doesNotMatch(md, /^line2 \/\/ 2$/m);
        assert.doesNotMatch(md, /^line9 \/\/ 9$/m);
    });

    it('honors contextLines: 0', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 5, end: 5 }], {
            contextLines: 0,
        });
        assert.match(md, /^line5 \/\/ 5$/m);
        assert.doesNotMatch(md, /^line4 \/\/ 4$/m);
        assert.doesNotMatch(md, /^line6 \/\/ 6$/m);
    });

    it('honors contextLines: 5', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 5, end: 5 }], {
            contextLines: 5,
        });
        assert.match(md, /^line1 \/\/ 1$/m);
        assert.match(md, /^line10 \/\/ 10$/m);
    });

    it('throws on a negative contextLines value', () => {
        assert.throws(
            () =>
                buildMarkdown('/p/f.js', lines, [{ start: 3, end: 4 }], {
                    contextLines: -1,
                }),
            /Invalid contextLines/
        );
    });

    it('merges overlapping ranges before rendering', () => {
        const md = buildMarkdown('/p/f.js', lines, [
            { start: 3, end: 6 },
            { start: 5, end: 8 },
        ]);
        assert.match(md, /Ranges: 1/);
        assert.match(md, /## Range \(3, 8\)/);
        const headings = md.match(/## Range \(/g) ?? [];
        assert.equal(headings.length, 1);
    });

    it('clamps context at the start of the file', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 1, end: 2 }]);
        assert.match(md, /^line1 \/\/ 1$/m);
        assert.match(md, /^line4 \/\/ 4$/m);
        assert.doesNotMatch(md, /^line5 \/\/ 5$/m);
    });

    it('clamps context at the end of the file', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 9, end: 10 }]);
        assert.match(md, /^line8 \/\/ 8$/m);
        assert.match(md, /^line10 \/\/ 10$/m);
        assert.doesNotMatch(md, /^line11 /m);
    });

    it('handles a range entirely past the file end without crashing', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 20, end: 25 }]);
        assert.match(md, /## Range \(20, 25\)/);
        assert.match(md, /```js\n```/);
    });

    it('uses three backticks when the snippet has no backticks', () => {
        const md = buildMarkdown('/p/f.js', ['alpha', 'beta'], [{ start: 1, end: 2 }]);
        assert.match(md, /^```js$/m);
        assert.match(md, /^```$/m);
    });

    it('grows the fence when the snippet contains triple backticks', () => {
        const content = ['const a = 1;', 'const md = "```js";', 'const b = 2;', 'const c = 3;'];
        const md = buildMarkdown('/p/f.js', content, [{ start: 2, end: 2 }], {
            contextLines: 1,
        });
        assert.match(md, /^````js$/m);
        assert.match(md, /^````$/m);
    });

    it('grows the fence to match long backtick runs', () => {
        const content = ['`````', 'next', 'more'];
        const md = buildMarkdown('/p/f.js', content, [{ start: 1, end: 1 }], {
            contextLines: 0,
        });
        assert.match(md, /^``````js$/m);
    });

    it('appends the line number to every rendered line', () => {
        const md = buildMarkdown('/p/f.js', ['alpha', 'beta'], [{ start: 1, end: 2 }]);
        assert.match(md, /^alpha \/\/ 1$/m);
        assert.match(md, /^beta \/\/ 2$/m);
    });

    it('separates multiple sections with blank lines', () => {
        const md = buildMarkdown('/p/f.js', lines, [
            { start: 3, end: 4 },
            { start: 6, end: 6 },
        ]);
        assert.match(md, /## Range \(3, 4\)[\s\S]*\n\n## Range \(6, 6\)/);
    });
});

describe('CLI', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'cov2md-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    /**
     * Run the CLI with the given arguments and return the result.
     * @param {string[]} args
     * @returns {import('node:child_process').SpawnSyncReturns<string>}
     */
    function run(args) {
        return spawnSync(process.execPath, [cliPath, ...args], {
            encoding: 'utf8',
        });
    }

    it('writes the markdown file for valid named flags', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n', 'utf8');

        const result = run(['--ranges', '2-3', '--input', srcPath, '--output', outPath]);
        assert.equal(result.status, 0);

        const md = readFileSync(outPath, 'utf8');
        assert.match(md, /^# Coverage: src\.js$/m);
        assert.match(md, /## Range \(2, 3\)/);
        assert.match(md, /^a \/\/ 1$/m);
        assert.match(md, /^e \/\/ 5$/m);
        assert.doesNotMatch(md, /^f \/\/ 6$/m);
        assert.match(md, /^```js$/m);
    });

    it('accepts short flags', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 0);
        assert.match(readFileSync(outPath, 'utf8'), /## Range \(1, 1\)/);
    });

    it('honors -c / --context', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        const content = Array.from({ length: 10 }, (_, i) => `l${i + 1}`).join('\n') + '\n';
        writeFileSync(srcPath, content, 'utf8');

        const result = run(['-r', '5', '-i', srcPath, '-o', outPath, '-c', '0']);
        assert.equal(result.status, 0);

        const md = readFileSync(outPath, 'utf8');
        assert.match(md, /^l5 \/\/ 5$/m);
        assert.doesNotMatch(md, /^l4 \/\/ 4$/m);
        assert.doesNotMatch(md, /^l6 \/\/ 6$/m);
    });

    it('honors --title', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath, '--title', 'My Custom Title']);
        assert.equal(result.status, 0);
        assert.match(readFileSync(outPath, 'utf8'), /^# My Custom Title$/m);
    });

    it('honors --fence override', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath, '--fence', 'python']);
        assert.equal(result.status, 0);
        assert.match(readFileSync(outPath, 'utf8'), /^```python$/m);
    });

    it('merges overlapping ranges from the CLI', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        const content = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n') + '\n';
        writeFileSync(srcPath, content, 'utf8');

        const result = run(['-r', '5-8,7-10', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 0);

        const md = readFileSync(outPath, 'utf8');
        assert.match(md, /Ranges: 1/);
        assert.match(md, /## Range \(5, 10\)/);
    });

    it('prints a multi-line summary with absolute paths and size', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'x\ny\nz\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /coverage-to-markdown: wrote report/);
        assert.match(result.stdout, new RegExp(`input:\\s+${escapeRegExp(srcPath)}`));
        assert.match(result.stdout, new RegExp(`output:\\s+${escapeRegExp(outPath)}`));
        assert.match(result.stdout, /ranges: 1 \(from 1 parsed\)/);
        assert.match(result.stdout, /size:\s+\d+ bytes/);
    });

    it('prints help with --help and exits 0', () => {
        const result = run(['--help']);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /Usage:/);
        assert.match(result.stdout, /--ranges/);
        assert.match(result.stdout, /--input/);
        assert.match(result.stdout, /--output/);
        assert.match(result.stdout, /--context/);
        assert.match(result.stdout, /--title/);
        assert.match(result.stdout, /--fence/);
        assert.match(result.stdout, /--force/);
    });

    it('prints version with --version and exits 0', () => {
        const result = run(['--version']);
        assert.equal(result.status, 0);
        assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
    });

    it('rejects missing --ranges', () => {
        const result = run(['--input', 'a', '--output', 'b']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Missing required argument.*--ranges/);
    });

    it('rejects missing --input', () => {
        const result = run(['--ranges', '1', '--output', 'b']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Missing required argument.*--input/);
    });

    it('rejects missing --output', () => {
        const result = run(['--ranges', '1', '--input', 'a']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Missing required argument.*--output/);
    });

    it('rejects bare positional arguments', () => {
        const result = run(['1-2', 'a.js', 'out.md']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Unexpected positional argument/);
    });

    it('rejects a mix of named and positional arguments', () => {
        const result = run(['--ranges', '1-2', 'a.js', 'out.md']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Unexpected positional argument/);
    });

    it('rejects invalid --context values', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'x\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath, '-c', 'abc']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Invalid --context/);
    });

    it('rejects unknown options', () => {
        const result = run(['--ranges', '1', '--input', 'a', '--output', 'b', '--nope']);
        assert.equal(result.status, 1);
    });

    it('rejects an empty --ranges string', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'x\n', 'utf8');

        const result = run(['-r', '', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /produced no ranges/);
    });

    it('rejects invalid range strings without a stack trace', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'x\n', 'utf8');

        const result = run(['-r', '5-2', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /end < start/);
        assert.doesNotMatch(result.stderr, /\n\s+at /);
    });

    it('fails when the input file does not exist', () => {
        const outPath = join(tmpDir, 'out.md');
        const result = run(['-r', '1-2', '-i', join(tmpDir, 'nope.js'), '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Input file not found/);
    });

    it('fails when the input path is a directory', () => {
        const outPath = join(tmpDir, 'out.md');
        const result = run(['-r', '1-2', '-i', tmpDir, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /not a regular file/);
    });

    it('refuses to overwrite an existing output file without --force', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');
        writeFileSync(outPath, 'KEEP ME', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /already exists/);
        assert.match(result.stderr, /--force/);
        assert.equal(readFileSync(outPath, 'utf8'), 'KEEP ME');
    });

    it('overwrites an existing output file when --force is given', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');
        writeFileSync(outPath, 'OLD', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath, '--force']);
        assert.equal(result.status, 0);
        const md = readFileSync(outPath, 'utf8');
        assert.match(md, /^# Coverage: src\.js$/m);
        assert.notEqual(md, 'OLD');
    });

    it('rejects when --input and --output resolve to the same path', () => {
        const srcPath = join(tmpDir, 'src.js');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', srcPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /different files/);
        assert.equal(readFileSync(srcPath, 'utf8'), 'a\nb\nc\n');
    });

    it('rejects when --input and --output resolve to the same path even with --force', () => {
        const srcPath = join(tmpDir, 'src.js');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', srcPath, '--force']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /different files/);
        assert.equal(readFileSync(srcPath, 'utf8'), 'a\nb\nc\n');
    });

    it('rejects when --input and --output are lexically different but resolve to the same path', () => {
        const srcPath = join(tmpDir, 'src.js');
        writeFileSync(srcPath, 'a\nb\nc\n', 'utf8');
        const disguised = join(tmpDir, '.', 'src.js');

        const result = run(['-r', '1', '-i', srcPath, '-o', disguised, '--force']);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /different files/);
        assert.equal(readFileSync(srcPath, 'utf8'), 'a\nb\nc\n');
    });

    it('prefixes error output for visibility', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'x\n', 'utf8');

        const result = run(['-r', '5-2', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /^coverage-to-markdown: error:/m);
        assert.match(result.stderr, /end < start/);
        assert.doesNotMatch(result.stderr, /\n\s+at /);
    });

    it('prints --quiet suppresses the success summary', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath, '-q']);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.match(readFileSync(outPath, 'utf8'), /## Range \(1, 1\)/);
    });

    it('rejects an --output path whose directory does not exist', () => {
        const srcPath = join(tmpDir, 'src.js');
        writeFileSync(srcPath, 'a\n', 'utf8');
        const missingDir = join(tmpDir, 'no', 'such', 'dir');
        const outPath = join(missingDir, 'out.md');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Output directory does not exist/);
        assert.match(result.stderr, /Create it first/);
    });

    it('prefixes error output for visibility', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'x\n', 'utf8');

        const result = run(['-r', '5-2', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /^coverage-to-markdown: error:/m);
        assert.match(result.stderr, /end < start/);
        assert.doesNotMatch(result.stderr, /\n\s+at /);
    });

    it('prints --quiet suppresses the success summary', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\n', 'utf8');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath, '-q']);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.match(readFileSync(outPath, 'utf8'), /## Range \(1, 1\)/);
    });

    it('rejects an --output path whose directory does not exist', () => {
        const srcPath = join(tmpDir, 'src.js');
        writeFileSync(srcPath, 'a\n', 'utf8');
        const missingDir = join(tmpDir, 'no', 'such', 'dir');
        const outPath = join(missingDir, 'out.md');

        const result = run(['-r', '1', '-i', srcPath, '-o', outPath]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Output directory does not exist/);
        assert.match(result.stderr, /Create it first/);
    });
});
