// @ts-check
/**
 * Command-line surface: defaults, the `parseArgs` option table, the help
 * text, and validators for option values. Nothing here touches the file
 * system, so the whole module is trivially testable.
 */

/** @typedef {import('./types.js').HighlightMode} HighlightMode */
/** @typedef {import('./types.js').SortMode} SortMode */

export const DEFAULT_REPORT = 'coverage/coverage-final.json';
export const DEFAULT_OUTPUT = 'cov.md';
export const DEFAULT_CONTEXT = 2;
export const DEFAULT_MAX_LINES = 80;

/** @type {HighlightMode[]} */
export const VALID_HIGHLIGHTS = ['none', 'comment', 'gutter'];

/** @type {SortMode[]} */
export const VALID_SORTS = ['alpha', 'gaps', 'percent'];

/**
 * Option table for `node:util.parseArgs`.
 * `--no-git` and `--no-timestamp` are declared separately because
 * `parseArgs` does not support automatic negation.
 *
 * The const assertion keeps `type` literal so `parseArgs` resolves to its
 * typed overload; see the note in `../cov2md/args.js`. Without it every read
 * of `values` is an index signature and `--sort`, `--title` and `--source`
 * have to be cast before use.
 */
export const CLI_OPTIONS = /** @type {const} */ ({
    input: { type: 'string', short: 'i' },
    source: { type: 'string', short: 's' },
    output: { type: 'string', short: 'o' },
    json: { type: 'string' },
    context: { type: 'string', short: 'c' },
    'max-lines': { type: 'string' },
    sort: { type: 'string' },
    title: { type: 'string', short: 't' },
    highlight: { type: 'string' },
    'absolute-path': { type: 'boolean' },
    git: { type: 'boolean' },
    timestamp: { type: 'boolean' },
    'no-git': { type: 'boolean' },
    'no-timestamp': { type: 'boolean' },
    force: { type: 'boolean', short: 'f' },
    quiet: { type: 'boolean', short: 'q' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
});
export const HELP_TEXT = `coverage-json-to-markdown — list uncovered lines and branches as Markdown

Usage:
  coverage-json-to-markdown [coverage.json] [options]

Arguments:
  [coverage.json]         Path to an istanbul/c8 JSON coverage report.
                          Default: ${DEFAULT_REPORT}
                          May also be passed as -i/--input.

Options:
  -i, --input <path>      Same as the positional report path
  -s, --source <path>     Restrict the report to one analysed source file.
                          Accepts an absolute path, a path suffix or a
                          bare basename; ambiguity is an error.
  -o, --output <path>     Markdown file to write (default: ${DEFAULT_OUTPUT})
      --json <path>       Also write the gaps as JSON to <path>. Off by default:
                          the Markdown has to stay readable, and the numbers are
                          already in the per-file table.
  -c, --context <n>       Lines of context before and after a gap when no
                          enclosing function is available (default: ${DEFAULT_CONTEXT})
      --max-lines <n>     Hard cap on a snippet length (default: ${DEFAULT_MAX_LINES})
      --sort <mode>       File order: alpha | gaps | percent (default: alpha)
  -t, --title <s>         Top-level heading (default: "Coverage gaps")
      --highlight <mode>  Gap marker: none | comment | gutter (default: comment)
      --absolute-path     Print source paths as absolute (default: relative
                          to the current working directory)
      --no-git            Skip the Revision and Dirty lines
      --no-timestamp      Skip the Generated line (reproducible output)
  -f, --force             Overwrite the output file if it already exists
  -q, --quiet             Suppress the success summary on stdout
  -h, --help              Show this help and exit
  -v, --version           Print version and exit

Output:
  A Markdown document with provenance, a per-file table and one section per
  file with gaps. Pass --json to get the same gaps as data instead.

Examples:
  coverage-json-to-markdown
  coverage-json-to-markdown coverage/coverage-final.json --source src/index.js
  coverage-json-to-markdown -s index.js -o gaps.md --sort gaps
  coverage-json-to-markdown report.json -o cov.md --json gaps.json --force
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
 * @returns {number}
 */
export function parseMaxLinesOption(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error('Invalid --max-lines value: "' + raw + '" (expected a positive integer)');
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
 * @param {string} raw
 * @returns {SortMode}
 */
export function parseSortOption(raw) {
    if (!VALID_SORTS.includes(/** @type {SortMode} */ (raw))) {
        throw new Error(
            'Invalid --sort value: "' + raw + '". Expected one of: ' + VALID_SORTS.join(', ') + '.'
        );
    }
    return /** @type {SortMode} */ (raw);
}
