#!/usr/bin/env node

// @ts-check

/**
 * Coverage-to-markdown utility.
 *
 * Reads a source file and a coverage range string like
 * "176-181,258-270,305" and writes a markdown document where each range
 * is rendered as a fenced code block with configurable context lines
 * around it, and each line gets an inline "// <lineNumber>" comment.
 *
 * All CLI arguments are named flags. There is no positional form on
 * purpose: a missing or misplaced positional argument could otherwise
 * silently point the output at the input file and overwrite it.
 *
 * The fence language is inferred from the source file extension, and the
 * fence length grows automatically when the snippet contains backtick
 * runs so that markdown fences never break.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * @typedef {import('./types.js').Range} Range
 * @typedef {import('./types.js').BuildOptions} BuildOptions
 */

/** @type {number} */
const DEFAULT_CONTEXT_LINES = 2;

/** @type {number} */
const MIN_FENCE_LENGTH = 3;

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
  -f, --force             Overwrite the output file if it already exists
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
`;

/**
 * Parse a coverage range string into an array of ranges.
 * Accepts comma-separated segments in the form "x-y" or "x".
 * Does not merge overlapping or adjacent ranges — use {@link normalizeRanges}
 * for that.
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
 * Parse a single segment of form "x-y" or "x" into a Range.
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
 * Parse a positive integer line number.
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
 * For example, `[5-7, 8-10, 12-14]` becomes `[5-10, 12-14]`.
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
 * Detect the markdown fence language from a file path extension.
 * Returns an empty string for unknown extensions or dotfiles.
 * @param {string} filePath
 * @returns {string}
 */
function detectFenceLanguage(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const ext = extname(normalized).toLowerCase();
    return EXTENSION_TO_FENCE[ext] ?? '';
}

/**
 * Compute the fence length needed so the snippet never breaks the fence.
 * Scans the snippet lines for backtick runs and returns `maxRun + 1`,
 * clamped to a minimum of three backticks.
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
 * Split file content into lines, stripping trailing CR characters.
 * @param {string} content
 * @returns {string[]}
 */
function splitLines(content) {
    return content.split('\n').map(line => line.replace(/\r$/, ''));
}

/**
 * Compute the 1-based snippet boundaries for a range, clamped to file size.
 * @param {string[]} lines
 * @param {Range} range
 * @param {number} contextLines
 * @returns {{ start: number, end: number }}
 */
function snippetBounds(lines, range, contextLines) {
    const total = lines.length;
    return {
        start: Math.max(1, range.start - contextLines),
        end: Math.min(total, range.end + contextLines),
    };
}

/**
 * Render snippet lines with `// <lineNumber>` suffixes.
 * @param {string[]} lines
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
function renderSnippet(lines, start, end) {
    const parts = [];
    for (let n = start; n <= end; n += 1) {
        parts.push(`${lines[n - 1] ?? ''} // ${n}`);
    }
    return parts.join('\n');
}

/**
 * Build the markdown document body for all ranges.
 * Input ranges are normalized (overlapping and adjacent ranges merged)
 * before rendering.
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

    const normalized = normalizeRanges(ranges);
    const title = options.title ?? `Coverage: ${basenameOf(sourcePath)}`;
    const fenceLang = options.fence !== undefined ? options.fence : detectFenceLanguage(sourcePath);

    const header = [
        `# ${title}`,
        '',
        `Source: \`${sourcePath}\``,
        '',
        `Ranges: ${normalized.length}`,
    ].join('\n');

    const sections = normalized.map(range => {
        const bounds = snippetBounds(lines, range, contextLines);
        const fenceLength = pickFenceLength(lines, bounds.start, bounds.end);
        const fence = '`'.repeat(fenceLength);
        const snippet = renderSnippet(lines, bounds.start, bounds.end);

        const block = [`${fence}${fenceLang}`];
        if (snippet.length > 0) {
            block.push(snippet);
        }
        block.push(fence);

        return [`## Range (${range.start}, ${range.end})`, '', ...block].join('\n');
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
 * Read the package version from package.json.
 * @returns {string}
 */
function readVersion() {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8'));
    return pkg.version;
}

/**
 * Parse and validate the `--context` option value.
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
 * Reject positional arguments passed to the CLI.
 * Named arguments are mandatory so that a forgotten flag cannot shift
 * paths around and overwrite the input file with output.
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
 * Ensure every required flag is present.
 * @param {Record<string, unknown>} values
 * @returns {{ ranges: string, input: string, output: string }}
 */
function readRequiredFlags(values) {
    const missing = [];
    if (values.ranges === undefined) {
        missing.push('--ranges');
    }
    if (values.input === undefined) {
        missing.push('--input');
    }
    if (values.output === undefined) {
        missing.push('--output');
    }
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
 * @param {string} sourcePath absolute path to the source file
 * @param {string} outputPath absolute path to the output file
 * @param {boolean} force whether --force was passed
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
                force: { type: 'boolean', short: 'f' },
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

        const sourcePath = resolve(flags.input);
        const outputPath = resolve(flags.output);
        guardFilePaths(sourcePath, outputPath, values.force === true);

        const rawRanges = parseRanges(flags.ranges);
        if (rawRanges.length === 0) {
            throw new Error('--ranges produced no ranges; check the input string.');
        }

        const content = readFileSync(sourcePath, 'utf8');
        const lines = splitLines(content);

        const markdown = buildMarkdown(sourcePath, lines, rawRanges, {
            contextLines,
            title: values.title,
            fence: values.fence,
        });

        writeFileSync(outputPath, markdown, 'utf8');
        const count = normalizeRanges(rawRanges).length;
        process.stdout.write(`Wrote ${count} range(s) from ${sourcePath} to ${outputPath}\n`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`${message}\n`);
        process.exit(1);
    }
}

export { parseRanges, normalizeRanges, detectFenceLanguage, buildMarkdown };

const entryArg = process.argv[1];
const isMain = entryArg !== undefined && import.meta.url === pathToFileURL(entryArg).href;
if (isMain) {
    main(process.argv.slice(2));
}
