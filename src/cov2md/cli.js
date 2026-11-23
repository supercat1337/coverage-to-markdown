// @ts-check

/**
 * CLI orchestration. `main` does the work and may throw; `runCli` is the
 * boundary that turns a failure into one stderr line and exit code 1.
 *
 * The main-module check lives in the entry file, not here, because the entry
 * is what `bin` points at — comparing `import.meta.url` of this module would
 * always mismatch.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
    CLI_OPTIONS,
    HELP_TEXT,
    parseContextOption,
    parseHighlightOption,
    readRequiredFlags,
    rejectPositionals,
} from './args.js';
import { buildMarkdown, DEFAULT_CONTEXT_LINES, splitLines } from './markdown.js';
import { guardFilePaths, guardOutputDirectory, toDisplayPath } from './paths.js';
import { normalizeRanges, parseRanges } from './ranges.js';

/** Name used in every message on stdout and stderr. */
const CLI_NAME = 'coverage-to-markdown';

/**
 * Read the package version. This module lives two levels below the package
 * root, so the path is `../../package.json`.
 * @returns {string}
 */
function readVersion() {
    const pkgUrl = new URL('../../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8'));
    return pkg.version;
}

/**
 * @param {string[]} argv
 * @returns {void}
 */
function main(argv) {
    const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: CLI_OPTIONS,
    });

    if (values.help) {
        process.stdout.write(HELP_TEXT);
        return;
    }

    if (values.version) {
        process.stdout.write(readVersion() + '\n');
        return;
    }

    rejectPositionals(positionals);
    const flags = readRequiredFlags(values);

    const contextLines =
        values.context !== undefined ? parseContextOption(values.context) : DEFAULT_CONTEXT_LINES;

    const highlight =
        values.highlight !== undefined ? parseHighlightOption(values.highlight) : 'comment';

    const sourcePath = resolve(flags.input);
    const outputPath = resolve(flags.output);

    guardFilePaths(sourcePath, outputPath, values.force === true);
    guardOutputDirectory(outputPath);

    const rawRanges = parseRanges(flags.ranges);
    if (rawRanges.length === 0) {
        throw new Error('--ranges produced no ranges; check the input string.');
    }

    const lines = splitLines(readFileSync(sourcePath, 'utf8'));
    const displayPath = values['absolute-path'] === true ? sourcePath : toDisplayPath(sourcePath);

    const markdown = buildMarkdown(displayPath, lines, rawRanges, {
        contextLines,
        highlight,
        title: values.title,
        fence: values.fence,
        command: values.command,
    });

    writeFileSync(outputPath, markdown, 'utf8');

    if (values.quiet) {
        return;
    }

    const written = statSync(outputPath);
    const count = normalizeRanges(rawRanges).length;

    process.stdout.write(
        [
            CLI_NAME + ': wrote report',
            '  input:  ' + sourcePath,
            '  output: ' + outputPath,
            '  ranges: ' + count + ' (from ' + rawRanges.length + ' parsed)',
            '  size:   ' + written.size + ' bytes',
        ].join('\n') + '\n'
    );
}

/**
 * Entry boundary: a single message on stderr and exit code 1, no stack traces.
 * @param {string[]} argv
 * @returns {void}
 */
export function runCli(argv) {
    try {
        main(argv);
    } catch (error) {
        /* c8 ignore next -- main() throws Error only; String() is unreachable */
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(CLI_NAME + ': error: ' + message + '\n');
        process.exit(1);
    }
}
