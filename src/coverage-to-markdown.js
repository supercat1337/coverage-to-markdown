#!/usr/bin/env node

// @ts-check

/**
 * Coverage-to-markdown utility.
 *
 * Reads a source file and a coverage range string like
 * "176-181,258-270,305" and writes a markdown document where each range
 * is rendered as a code block with two extra context lines before and
 * after, and each line gets an inline "// <lineNumber>" comment.
 *
 * NOTE: line numbers are appended as text comments, so multi-line
 * template literals may be broken by this transformation.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {import('./types.js').Range} Range
 */

/**
 * Number of extra context lines added before and after a coverage range.
 * @type {number}
 */
const CONTEXT_LINES = 2;

/**
 * Parse a coverage range string into an array of ranges.
 * Accepts comma-separated segments in the form "x-y" or "x".
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
 * Split file content into lines, stripping trailing CR characters.
 * @param {string} content
 * @returns {string[]}
 */
function splitLines(content) {
    return content.split('\n').map(line => line.replace(/\r$/, ''));
}

/**
 * Build a code snippet for a range with two context lines before and
 * after, and inline line number comments appended to every line.
 * @param {string[]} lines
 * @param {Range} range
 * @returns {string}
 */
function buildSnippet(lines, range) {
    const total = lines.length;
    const snippetStart = Math.max(1, range.start - CONTEXT_LINES);
    const snippetEnd = Math.min(total, range.end + CONTEXT_LINES);
    const parts = [];
    for (let lineNumber = snippetStart; lineNumber <= snippetEnd; lineNumber += 1) {
        const line = lines[lineNumber - 1] ?? '';
        parts.push(`${line} // ${lineNumber}`);
    }
    return parts.join('\n');
}

/**
 * Build the markdown document body for all ranges.
 * @param {string} sourcePath
 * @param {string[]} lines
 * @param {Range[]} ranges
 * @returns {string}
 */
function buildMarkdown(sourcePath, lines, ranges) {
    const header = [
        `# Coverage: ${basename(sourcePath)}`,
        '',
        `Source: \`${sourcePath}\``,
        '',
        `Ranges: ${ranges.length}`,
    ].join('\n');

    const sections = ranges.map(range => {
        const snippet = buildSnippet(lines, range);
        const block = ['```js'];
        if (snippet.length > 0) {
            block.push(snippet);
        }
        block.push('```');
        return [`## Range (${range.start}, ${range.end})`, '', ...block].join('\n');
    });

    return [header, ...sections].join('\n\n') + '\n';
}

/**
 * CLI entry point.
 * @param {string[]} argv
 * @returns {void}
 */
function main(argv) {
    if (argv.length < 3) {
        console.error('Usage: coverage-to-markdown <ranges> <source-file> <output-md>');
        console.error('Example: coverage-to-markdown "1-5,10,20-25" ./src/index.js ./out.md');
        process.exit(1);
    }

    const [rangesArg, sourceArg, outputArg] = argv;
    const sourcePath = resolve(sourceArg);
    const outputPath = resolve(outputArg);

    const ranges = parseRanges(rangesArg);
    const content = readFileSync(sourcePath, 'utf8');
    const lines = splitLines(content);
    const markdown = buildMarkdown(sourcePath, lines, ranges);

    writeFileSync(outputPath, markdown, 'utf8');
    process.stdout.write(`Wrote ${ranges.length} range(s) from ${sourcePath} to ${outputPath}\n`);
}

export { parseRanges, buildMarkdown };

const entryArg = process.argv[1];
const isMain = entryArg !== undefined && import.meta.url === pathToFileURL(entryArg).href;
if (isMain) {
    main(process.argv.slice(2));
}
