// @ts-check

/**
 * Command-line surface: defaults, the `parseArgs` option table, the help
 * text, and validators. Nothing here touches the file system.
 */

import { VALID_HIGHLIGHTS } from './highlight.js';
import { DEFAULT_CONTEXT_LINES } from './markdown.js';

/** @typedef {import('./types.js').HighlightMode} HighlightMode */
/** @typedef {import('./types.js').RequiredFlags} RequiredFlags */

/**
 * Option table for `node:util.parseArgs`.
 *
 * The const assertion is load-bearing, not cosmetic. Without it a mutable
 * object property widens `type: 'string'` to `type: string`, which fails the
 * `ParseArgsOptionsConfig` constraint; `parseArgs` then falls back to its
 * untyped overload, whose `values` is an index signature of
 * `string | boolean | (string | boolean)[] | undefined`. Every option read
 * would need a cast, and `--title` could not be passed on to `buildMarkdown`.
 *
 * With it, `values` is inferred per key: a `string` option is
 * `string | undefined`, a `boolean` option is `boolean | undefined`.
 */
export const CLI_OPTIONS = /** @type {const} */ ({
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
});

export const HELP_TEXT = `coverage-to-markdown — convert coverage ranges to markdown snippets

Usage:
  coverage-to-markdown --ranges <ranges> --input <source-file> --output <output-md> [options]

Required arguments:
  -r, --ranges <ranges>   Comma-separated list of line ranges (e.g. "1-5,10,20-25")
  -i, --input <path>      Path to the source file whose lines will be extracted
  -o, --output <path>     Path to the markdown file that will be written

Options:
  -c, --context <n>       Lines of context before and after each range (default: ${DEFAULT_CONTEXT_LINES})
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
 * @param {string} raw
 * @returns {number}
 */
export function parseContextOption(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error('Invalid --context value: "' + raw + '" (expected a non-negative integer)');
    }
    return value;
}

/**
 * @param {string} raw
 * @returns {HighlightMode}
 */
export function parseHighlightOption(raw) {
    if (!VALID_HIGHLIGHTS.includes(/** @type {HighlightMode} */ (raw))) {
        throw new Error(
            'Invalid --highlight value: "' +
                raw +
                '". Expected one of: ' +
                VALID_HIGHLIGHTS.join(', ') +
                '.'
        );
    }
    return /** @type {HighlightMode} */ (raw);
}

/**
 * Named flags only: a stray positional argument is a hard error on purpose.
 * @param {string[]} positionals
 * @returns {void}
 */
export function rejectPositionals(positionals) {
    if (positionals.length === 0) {
        return;
    }
    throw new Error(
        'Unexpected positional argument(s): ' +
            positionals.join(' ') +
            '. All arguments must be named. Run with --help for usage.'
    );
}

/**
 * @param {Record<string, unknown>} values
 * @returns {RequiredFlags}
 */
export function readRequiredFlags(values) {
    /** @type {string[]} */
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
            'Missing required argument(s): ' + missing.join(', ') + '. Run with --help for usage.'
        );
    }

    return {
        ranges: String(values.ranges),
        input: String(values.input),
        output: String(values.output),
    };
}
