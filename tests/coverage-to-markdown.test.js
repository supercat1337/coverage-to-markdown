import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import { parseRanges, buildMarkdown } from '../src/coverage-to-markdown.js';

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

describe('buildMarkdown', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);

    it('renders a top-level heading with the basename', () => {
        const md = buildMarkdown('/abs/path/file.js', lines, [{ start: 3, end: 4 }]);
        assert.match(md, /^# Coverage: file\.js$/m);
    });

    it('renders the absolute source path', () => {
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

    it('renders a heading per range', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 3, end: 4 }]);
        assert.match(md, /## Range \(3, 4\)/);
    });

    it('adds two context lines before and after', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 5, end: 6 }]);
        assert.match(md, /^line3 \/\/ 3$/m);
        assert.match(md, /^line4 \/\/ 4$/m);
        assert.match(md, /^line5 \/\/ 5$/m);
        assert.match(md, /^line6 \/\/ 6$/m);
        assert.match(md, /^line7 \/\/ 7$/m);
        assert.match(md, /^line8 \/\/ 8$/m);
        assert.doesNotMatch(md, /^line2 \/\/ 2$/m);
        assert.doesNotMatch(md, /^line9 \/\/ 9$/m);
    });

    it('clamps context at the start of the file', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 1, end: 2 }]);
        assert.match(md, /^line1 \/\/ 1$/m);
        assert.match(md, /^line2 \/\/ 2$/m);
        assert.match(md, /^line3 \/\/ 3$/m);
        assert.match(md, /^line4 \/\/ 4$/m);
        assert.doesNotMatch(md, /^line5 \/\/ 5$/m);
    });

    it('clamps context at the end of the file', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 9, end: 10 }]);
        assert.match(md, /^line8 \/\/ 8$/m);
        assert.match(md, /^line9 \/\/ 9$/m);
        assert.match(md, /^line10 \/\/ 10$/m);
        assert.doesNotMatch(md, /^line11 /m);
    });

    it('handles a range entirely past the file end without crashing', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 20, end: 25 }]);
        assert.match(md, /## Range \(20, 25\)/);
        assert.match(md, /```js\n```/);
    });

    it('wraps each snippet in a fenced js code block', () => {
        const md = buildMarkdown('/p/f.js', lines, [{ start: 3, end: 4 }]);
        const fences = md.match(/```js/g) ?? [];
        assert.equal(fences.length, 1);
    });

    it('separates multiple sections with blank lines', () => {
        const md = buildMarkdown('/p/f.js', lines, [
            { start: 3, end: 4 },
            { start: 6, end: 6 },
        ]);
        assert.match(md, /## Range \(3, 4\)[\s\S]*\n\n## Range \(6, 6\)/);
    });

    it('appends the line number to every rendered line', () => {
        const md = buildMarkdown('/p/f.js', ['alpha', 'beta'], [{ start: 1, end: 2 }]);
        assert.match(md, /^alpha \/\/ 1$/m);
        assert.match(md, /^beta \/\/ 2$/m);
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

    it('writes the markdown file for valid input', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n', 'utf8');

        execFileSync(process.execPath, [cliPath, '2-3', srcPath, outPath], { encoding: 'utf8' });

        const md = readFileSync(outPath, 'utf8');
        assert.match(md, /^# Coverage: src\.js$/m);
        assert.match(md, /## Range \(2, 3\)/);
        assert.match(md, /^a \/\/ 1$/m);
        assert.match(md, /^b \/\/ 2$/m);
        assert.match(md, /^c \/\/ 3$/m);
        assert.match(md, /^d \/\/ 4$/m);
        assert.match(md, /^e \/\/ 5$/m);
        assert.doesNotMatch(md, /^f \/\/ 6$/m);
    });

    it('handles multiple ranges in one call', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        const content = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n') + '\n';
        writeFileSync(srcPath, content, 'utf8');

        execFileSync(process.execPath, [cliPath, '5-6,15', srcPath, outPath], { encoding: 'utf8' });

        const md = readFileSync(outPath, 'utf8');
        assert.match(md, /## Range \(5, 6\)/);
        assert.match(md, /## Range \(15, 15\)/);
        assert.match(md, /Ranges: 2/);
    });

    it('prints a summary to stdout', () => {
        const srcPath = join(tmpDir, 'src.js');
        const outPath = join(tmpDir, 'out.md');
        writeFileSync(srcPath, 'x\n', 'utf8');

        const stdout = execFileSync(process.execPath, [cliPath, '1', srcPath, outPath], {
            encoding: 'utf8',
        });

        assert.match(stdout, /Wrote 1 range\(s\)/);
        assert.match(stdout, /out\.md/);
    });

    it('exits with code 1 when no args are given', () => {
        const result = spawnSync(process.execPath, [cliPath], {
            encoding: 'utf8',
        });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Usage: coverage-to-markdown/);
    });

    it('exits with code 1 when only two args are given', () => {
        const result = spawnSync(process.execPath, [cliPath, '1-2', 'file.js'], {
            encoding: 'utf8',
        });
        assert.equal(result.status, 1);
    });

    it('fails when the source file does not exist', () => {
        const outPath = join(tmpDir, 'out.md');
        const result = spawnSync(
            process.execPath,
            [cliPath, '1-2', join(tmpDir, 'nope.js'), outPath],
            { encoding: 'utf8' }
        );
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /ENOENT|no such file/i);
    });
});
