#!/usr/bin/env node
/**
 * Coverage-to-markdown utility.
 *
 * Reads a source file and a coverage range string like
 * "176-181,258-270,305" and writes a markdown document where each range
 * is rendered as a fenced code block with configurable context lines
 * around it, an R-label, and uncovered lines marked according to the
 * `highlight` option.
 *
 * The fence language is inferred from the source file extension, and the
 * fence length grows automatically when the snippet contains backtick
 * runs so that markdown fences never break.
 */
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * @typedef {import('./types.js').Range} Range
 * @typedef {import('./types.js').BuildOptions} BuildOptions
 * @typedef {import('./types.js').HighlightMode} HighlightMode
 */

/** @type {number} */
const DEFAULT_CONTEXT_LINES = 2;

/** @type {number} */
const MIN_FENCE_LENGTH = 3;

/** @type {HighlightMode[]} */
const VALID_HIGHLIGHTS = ['none', 'comment', 'gutter'];

/**
 * File extension to markdown fence language identifier.
 * @type {Record<string, string>}
 */
const EXTENSION_TO_FENCE = {
    '.js': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.jsx': 'jsx',
    '.ts': 'ts',
    '.mts': 'ts',
    '.cts': 'ts',
    '.tsx': 'tsx',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.swift': 'swift',
    '.c': 'c',
    '.h': 'c',
    '.cc': 'cpp',
    '.cpp': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.md': 'markdown',
    '.xml': 'xml',
    '.lua': 'lua',
    '.dart': 'dart',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.erl': 'erlang',
    '.hs': 'haskell',
    '.clj': 'clojure',
    '.vue': 'vue',
    '.svelte': 'svelte',
};

const HELP_TEXT = `coverage-to-markdown — convert coverage ranges to markdown snippets

Usage:
  coverage-to-markdown --ranges <ranges> --input <source-file> --output <output-md> [options]

Required arguments:
  -r, --ranges <ranges>   Comma-separated list of line ranges (e.g. "1-5,10,20-25")
  -i, --input <path>      Path to the source file whose lines will be extracted
  -o, --output <path>     Path to the markdown file that will be written

Options:
  -c, --context <n>       Lines of context before and after each range (default: 2)
  -t, --title <s>         Top-level heading text (default: "Coverage: <basename>")
      --fence <lang>      Override fence language (default: from file extension)
      --highlight <mode>  Marker for uncovered lines: none | comment | gutter (default: comment)
      --command <cmd>     Add a "Reproduce:" line with the given command
      --absolute-path     Print the source path as absolute (default: relative to cwd)
  -f, --force             Overwrite the output file if it already exists
  -q, --quiet             Suppress the success summary on stdout
  -h, --help              Show this help and exit
  -v, --version           Print version and exit

Safety:
  All arguments must be named. Positional arguments are rejected on
  purpose so that a forgotten flag cannot silently overwrite the input
  file. The tool refuses to write over an existing file unless --force
  is given, and rejects --input and --output pointing at the same path.

Examples:
  coverage-to-markdown --ranges "176-181,258-270" --input ./src/index.js --output ./coverage.md
  coverage-to-markdown -r "10-20" -i ./src/util.ts -o ./ctx.md -c 5
  coverage-to-markdown -r "1-5" -i ./src/index.js -o ./existing.md --force
  coverage-to-markdown -r "10-20" -i ./src/client.js -o ./cov.md \\
      --highlight gutter --command "npm test && npx c8 report"
`;

/**
 * Parse a coverage range string into an array of ranges.
 * @param {string} input
 * @returns {Range[]}
 */
function parseRanges(input) {
    return input
        .split(',')
        .map(segment => segment.trim())
        .filter(segment => segment.length > 0)
        .map(segment => parseRangeSegment(segment));
}

/**
 * @param {string} segment
 * @returns {Range}
 */
function parseRangeSegment(segment) {
    const dashIndex = segment.indexOf('-');
    if (dashIndex === -1) {
        const line = parseLineNumber(segment);
        return { start: line, end: line };
    }
    const start = parseLineNumber(segment.slice(0, dashIndex));
    const end = parseLineNumber(segment.slice(dashIndex + 1));
    if (end < start) {
        throw new Error(`Invalid range (end < start): "${segment}"`);
    }
    return { start, end };
}

/**
 * @param {string} raw
 * @returns {number}
 */
function parseLineNumber(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`Invalid line number: "${raw}"`);
    }
    return value;
}

/**
 * Sort ranges and merge overlapping or directly adjacent ones.
 * @param {Range[]} ranges
 * @returns {Range[]}
 */
function normalizeRanges(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) {
        return [];
    }
    const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [{ start: sorted[0].start, end: sorted[0].end }];
    for (let i = 1; i < sorted.length; i += 1) {
        const last = merged[merged.length - 1];
        const current = sorted[i];
        if (current.start <= last.end + 1) {
            if (current.end > last.end) {
                last.end = current.end;
            }
        } else {
            merged.push({ start: current.start, end: current.end });
        }
    }
    return merged;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function detectFenceLanguage(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const ext = extname(normalized).toLowerCase();
    return EXTENSION_TO_FENCE[ext] ?? '';
}

/**
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {number}
 */
function pickFenceLength(lines, start, end) {
    let maxRun = 0;
    const from = Math.max(0, start - 1);
    const to = Math.min(end, lines.length);
    for (let i = from; i < to; i += 1) {
        const line = lines[i] ?? '';
        const runs = line.match(/`+/g);
        if (runs) {
            for (const run of runs) {
                if (run.length > maxRun) {
                    maxRun = run.length;
                }
            }
        }
    }
    return Math.max(MIN_FENCE_LENGTH, maxRun + 1);
}

/**
 * @param {string} content
 * @returns {string[]}
 */
function splitLines(content) {
    return content.split('\n').map(line => line.replace(/\r$/, ''));
}

/**
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} contextLines
 * @returns {{ start: number, end: number }}
 */
function snippetBounds(lines, range, contextLines) {
    return {
        start: Math.max(1, range.start - contextLines),
        end: Math.min(lines.length, range.end + contextLines),
    };
}

/**
 * Format a range as a heading label: "line 56" or "lines 111–112".
 * Uses an en-dash between range endpoints.
 * @param {Range} range
 * @returns {string}
 */
function formatRangeLabel(range) {
    if (range.start === range.end) {
        return `line ${range.start}`;
    }
    return `lines ${range.start}–${range.end}`;
}

/**
 * Render snippet in `none` mode: every line gets `// <n>`, no marker.
 * @param {string[]} lines
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @returns {string}
 */
function renderSnippetNone(lines, snippetStart, snippetEnd) {
    const parts = [];
    for (let n = snippetStart; n <= snippetEnd; n += 1) {
        parts.push(`${lines[n - 1] ?? ''} // ${n}`);
    }
    return parts.join('\n');
}

/**
 * Render snippet in `comment` mode: context lines get `// <n>`,
 * uncovered lines get `// <n> ← UNCOVERED`.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @returns {string}
 */
function renderSnippetComment(lines, range, snippetStart, snippetEnd) {
    const parts = [];
    for (let n = snippetStart; n <= snippetEnd; n += 1) {
        const isUncovered = n >= range.start && n <= range.end;
        const marker = isUncovered ? ' ← UNCOVERED' : '';
        parts.push(`${lines[n - 1] ?? ''} // ${n}${marker}`);
    }
    return parts.join('\n');
}

/**
 * Render snippet in `gutter` mode: line number on the left with `│`
 * separator, `>` for uncovered lines. Line numbers are right-aligned
 * to the width of the largest number in the snippet.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @returns {string}
 */
function renderSnippetGutter(lines, range, snippetStart, snippetEnd) {
    const width = String(snippetEnd).length;
    const parts = [];
    for (let n = snippetStart; n <= snippetEnd; n += 1) {
        const isUncovered = n >= range.start && n <= range.end;
        const prefix = isUncovered ? '> ' : '  ';
        const padded = String(n).padStart(width, ' ');
        parts.push(`${prefix}${padded} │ ${lines[n - 1] ?? ''}`);
    }
    return parts.join('\n');
}

/**
 * Dispatch to the correct snippet renderer.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} snippetStart
 * @param {number} snippetEnd
 * @param {HighlightMode} highlight
 * @returns {string}
 */
function renderSnippet(lines, range, snippetStart, snippetEnd, highlight) {
    if (highlight === 'gutter') {
        return renderSnippetGutter(lines, range, snippetStart, snippetEnd);
    }
    if (highlight === 'none') {
        return renderSnippetNone(lines, snippetStart, snippetEnd);
    }
    return renderSnippetComment(lines, range, snippetStart, snippetEnd);
}

/**
 * Build the markdown document body for all ranges.
 * @param {string} sourcePath
 * @param {string[]} lines
 * @param {Range[]} ranges
 * @param {BuildOptions} [options]
 * @returns {string}
 */
function buildMarkdown(sourcePath, lines, ranges, options = {}) {
    const contextLines = options.contextLines ?? DEFAULT_CONTEXT_LINES;
    if (!Number.isInteger(contextLines) || contextLines < 0) {
        throw new Error(`Invalid contextLines: ${contextLines}`);
    }

    const highlight = options.highlight ?? 'comment';
    if (!VALID_HIGHLIGHTS.includes(highlight)) {
        throw new Error(
            `Invalid highlight mode: "${highlight}". ` +
                `Expected one of: ${VALID_HIGHLIGHTS.join(', ')}.`
        );
    }

    const normalized = normalizeRanges(ranges);
    const title = options.title ?? `Coverage: ${basenameOf(sourcePath)}`;
    const fenceLang = options.fence !== undefined ? options.fence : detectFenceLanguage(sourcePath);

    const headerLines = [`# ${title}`, '', `Source: \`${sourcePath}\``];

    if (typeof options.command === 'string' && options.command.length > 0) {
        const safeCommand = options.command.replace(/`/g, "'").replace(/\r?\n/g, ' ');
        headerLines.push(`Reproduce: \`${safeCommand}\``);
    }

    headerLines.push('');

    const count = normalized.length;
    const noun = count === 1 ? 'range' : 'ranges';
    headerLines.push(`${count} ${noun} · one contiguous uncovered block each · sorted by line`);
    headerLines.push('Labels R1..RN are assigned per run and may change when lines shift.');

    const header = headerLines.join('\n');

    const sections = normalized.map((range, index) => {
        const bounds = snippetBounds(lines, range, contextLines);
        const fenceLength = pickFenceLength(lines, bounds.start, bounds.end);
        const fence = '`'.repeat(fenceLength);
        const snippet = renderSnippet(lines, range, bounds.start, bounds.end, highlight);

        const block = [`${fence}${fenceLang}`];
        if (snippet.length > 0) {
            block.push(snippet);
        }
        block.push(fence);

        return [`## R${index + 1} · ${formatRangeLabel(range)}`, '', ...block].join('\n');
    });

    return [header, ...sections].join('\n\n') + '\n';
}

/**
 * Take the final path component regardless of the separator style.
 * @param {string} filePath
 * @returns {string}
 */
function basenameOf(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Return a display form of `absPath`: relative to cwd with forward
 * slashes when possible, otherwise the original absolute path.
 * @param {string} absPath
 * @returns {string}
 */
function toRelativeDisplay(absPath) {
    const rel = relative(process.cwd(), absPath);
    if (rel === '' || isAbsolute(rel)) {
        return absPath;
    }
    return rel.replace(/\\/g, '/');
}

/**
 * Read the package version from package.json.
 * @returns {string}
 */
function readVersion() {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8'));
    return pkg.version;
}

/**
 * @param {string} raw
 * @returns {number}
 */
function parseContextOption(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid --context value: "${raw}" (expected a non-negative integer)`);
    }
    return value;
}

/**
 * @param {string} raw
 * @returns {HighlightMode}
 */
function parseHighlightOption(raw) {
    if (!VALID_HIGHLIGHTS.includes(raw)) {
        throw new Error(
            `Invalid --highlight value: "${raw}". ` +
                `Expected one of: ${VALID_HIGHLIGHTS.join(', ')}.`
        );
    }
    return /** @type {HighlightMode} */ (raw);
}

/**
 * @param {string[]} positionals
 * @returns {void}
 */
function rejectPositionals(positionals) {
    if (positionals.length === 0) {
        return;
    }
    throw new Error(
        `Unexpected positional argument(s): ${positionals.join(' ')}. ` +
            'All arguments must be named. Run with --help for usage.'
    );
}

/**
 * @param {Record<string, unknown>} values
 * @returns {{ ranges: string, input: string, output: string }}
 */
function readRequiredFlags(values) {
    const missing = [];
    if (values.ranges === undefined) missing.push('--ranges');
    if (values.input === undefined) missing.push('--input');
    if (values.output === undefined) missing.push('--output');
    if (missing.length > 0) {
        throw new Error(
            `Missing required argument(s): ${missing.join(', ')}. ` + 'Run with --help for usage.'
        );
    }
    return {
        ranges: String(values.ranges),
        input: String(values.input),
        output: String(values.output),
    };
}

/**
 * Validate input and output paths before any file is written.
 * @param {string} sourcePath
 * @param {string} outputPath
 * @param {boolean} force
 * @returns {void}
 */
function guardFilePaths(sourcePath, outputPath, force) {
    if (sourcePath === outputPath) {
        throw new Error(
            '--input and --output must point at different files. ' +
                'Refusing to overwrite the source file.'
        );
    }
    if (!existsSync(sourcePath)) {
        throw new Error(`Input file not found: ${sourcePath}`);
    }
    if (!statSync(sourcePath).isFile()) {
        throw new Error(`Input path is not a regular file: ${sourcePath}`);
    }
    if (existsSync(outputPath) && !force) {
        throw new Error(
            `Output file already exists: ${outputPath}. ` + 'Pass --force to overwrite it.'
        );
    }
}

/**
 * Check whether the current module was started as the main script.
 * Compares real (symlink-resolved) paths instead of file URLs, because
 * on Windows process.argv[1] and import.meta.url can disagree on drive
 * letter case, on short (8.3) names, and on junction resolution when
 * launched through an npm bin shim (`npm link`).
 * @returns {boolean}
 */
function isMainModule() {
    const entry = process.argv[1];
    if (entry === undefined) {
        return false;
    }
    try {
        const selfPath = realpathSync(fileURLToPath(import.meta.url));
        const entryPath = realpathSync(resolve(entry));
        if (process.platform === 'win32') {
            return selfPath.toLowerCase() === entryPath.toLowerCase();
        }
        return selfPath === entryPath;
    } catch {
        return false;
    }
}

/**
 * CLI entry point.
 * @param {string[]} argv
 * @returns {void}
 */
function main(argv) {
    try {
        const { values, positionals } = parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                ranges: { type: 'string', short: 'r' },
                input: { type: 'string', short: 'i' },
                output: { type: 'string', short: 'o' },
                context: { type: 'string', short: 'c' },
                title: { type: 'string', short: 't' },
                fence: { type: 'string' },
                highlight: { type: 'string' },
                command: { type: 'string' },
                force: { type: 'boolean', short: 'f' },
                quiet: { type: 'boolean', short: 'q' },
                'absolute-path': { type: 'boolean' },
                help: { type: 'boolean', short: 'h' },
                version: { type: 'boolean', short: 'v' },
            },
        });

        if (values.help) {
            process.stdout.write(HELP_TEXT);
            return;
        }

        if (values.version) {
            process.stdout.write(`${readVersion()}\n`);
            return;
        }

        rejectPositionals(positionals);
        const flags = readRequiredFlags(values);

        const contextLines =
            values.context !== undefined
                ? parseContextOption(values.context)
                : DEFAULT_CONTEXT_LINES;
        const highlight =
            values.highlight !== undefined ? parseHighlightOption(values.highlight) : 'comment';

        const sourcePath = resolve(flags.input);
        const outputPath = resolve(flags.output);
        guardFilePaths(sourcePath, outputPath, values.force === true);

        const outputDir = dirname(outputPath);
        if (!existsSync(outputDir)) {
            throw new Error(
                `Output directory does not exist: ${outputDir}. ` +
                    'Create it first, or choose a different --output path.'
            );
        }

        const rawRanges = parseRanges(flags.ranges);
        if (rawRanges.length === 0) {
            throw new Error('--ranges produced no ranges; check the input string.');
        }

        const content = readFileSync(sourcePath, 'utf8');
        const lines = splitLines(content);

        const displayPath =
            values['absolute-path'] === true ? sourcePath : toRelativeDisplay(sourcePath);

        const markdown = buildMarkdown(displayPath, lines, rawRanges, {
            contextLines,
            highlight,
            title: values.title,
            fence: values.fence,
            command: values.command,
        });

        writeFileSync(outputPath, markdown, 'utf8');
        const written = statSync(outputPath);

        if (!values.quiet) {
            const count = normalizeRanges(rawRanges).length;
            process.stdout.write(
                [
                    'coverage-to-markdown: wrote report',
                    `  input:  ${sourcePath}`,
                    `  output: ${outputPath}`,
                    `  ranges: ${count} (from ${rawRanges.length} parsed)`,
                    `  size:   ${written.size} bytes`,
                ].join('\n') + '\n'
            );
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`coverage-to-markdown: error: ${message}\n`);
        process.exit(1);
    }
}

export { parseRanges, normalizeRanges, detectFenceLanguage, buildMarkdown };

if (isMainModule()) {
    main(process.argv.slice(2));
}
