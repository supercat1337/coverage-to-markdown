// @ts-check

/**
 * Selecting files out of the report, assembling their report objects, and
 * ordering them for display.
 */

import { resolve } from 'node:path';

import { toDisplayPath, percent } from './format.js';
import { analyzeFile } from './istanbul.js';
import { loadSource } from './source.js';

/** @typedef {import('./types.js').CoverageReport} CoverageReport */
/** @typedef {import('./types.js').CoverageEntry} CoverageEntry */
/** @typedef {import('./types.js').FileReport} FileReport */
/** @typedef {import('./types.js').SortMode} SortMode */
/** @typedef {import('./types.js').Totals} Totals */
/** @typedef {import('./types.js').LabeledGap} LabeledGap */

/**
 * Pick report entries to analyse, honouring an optional source filter.
 * @param {CoverageReport} report
 * @param {string | undefined} sourceFilter
 * @returns {string[]} Paths of the selected files, as they appear in the report.
 */
export function selectFiles(report, sourceFilter) {
    const paths = Object.keys(report).sort();

    if (sourceFilter === undefined || sourceFilter.length === 0) {
        return paths;
    }

    const needle = sourceFilter.replace(/\\/g, '/');
    const normalized = paths.map(path => ({ path, norm: path.replace(/\\/g, '/') }));

    const exact = normalized.filter(
        item => item.norm === needle || resolve(item.path) === resolve(sourceFilter)
    );
    if (exact.length > 0) {
        return exact.map(item => item.path);
    }

    const trimmed = needle.replace(/^\.?\//, '');
    const suffix = normalized.filter(
        item => item.norm === trimmed || item.norm.endsWith('/' + trimmed)
    );
    if (suffix.length === 1) {
        return [suffix[0].path];
    }
    if (suffix.length > 1) {
        throw new Error(
            '--source matches several files: ' +
                suffix.map(item => item.norm).join(', ') +
                '. Pass a longer path.'
        );
    }

    // No separate basename stage: a name that ends with `/trimmed` or equals
    // `trimmed` is already caught above, and a normalised path cannot contain
    // the segment any other way than across a slash. The stage that used to sit
    // here was unreachable, and its two error strings were never printed.

    const preview = normalized
        .slice(0, 10)
        .map(item => '  ' + item.norm)
        .join('\n');
    throw new Error(
        '--source did not match any file in the report: ' +
            sourceFilter +
            (normalized.length > 0 ? '\nFiles in the report:\n' + preview : '')
    );
}

/**
 * Build the render-ready object for one report entry.
 * @param {string} filePath
 * @param {CoverageEntry} entry
 * @param {boolean} absolutePath
 * @returns {FileReport}
 */
export function buildFileReport(filePath, entry, absolutePath) {
    const analyzed = analyzeFile(filePath, entry);
    const source = loadSource(filePath);

    /** @type {Set<number>} */
    const blockLines = new Set();
    for (const gap of analyzed.gaps) {
        if (gap.kind === 'block') {
            for (let n = gap.start; n <= gap.end; n += 1) {
                blockLines.add(n);
            }
        }
    }

    // v8 reports a branch at column 0 on the blank line where an implicit
    // `else`, `default` or class field begins. Inside a block that already says
    // "never executed" it carries no information — the code is right above it
    // and marked, so the bullet only repeats the block in a second notation.
    // Dropped here rather than in the renderer, because a region must not form
    // around a gap that will not be printed.
    const gaps = analyzed.gaps.filter(gap => {
        if (gap.kind !== 'branch' || !blockLines.has(gap.line)) {
            return true;
        }
        if (source === null) {
            return true;
        }
        return (source.lines[gap.line - 1] ?? '').trim().length > 0;
    });

    return {
        path: filePath,
        displayPath: absolutePath ? filePath : toDisplayPath(filePath),
        sourceLines: source ? source.lines : null,
        sha256: source ? source.sha256 : null,
        mtimeMs: source ? source.mtimeMs : null,
        blockLines,
        totals: analyzed.totals,
        gaps,
        reasons: analyzed.reasons,
        uncoveredFunctions: analyzed.uncoveredFunctions,
        functions: analyzed.functions,
    };
}

/**
 * @param {FileReport[]} files
 * @param {SortMode} mode
 * @returns {FileReport[]} Sorted copy.
 */
export function sortFiles(files, mode) {
    const list = [...files];

    if (mode === 'gaps') {
        list.sort(
            (a, b) => b.gaps.length - a.gaps.length || a.displayPath.localeCompare(b.displayPath)
        );
        return list;
    }

    if (mode === 'percent') {
        /**
         * @param {FileReport} file
         * @returns {number}
         */
        const share = file =>
            percent(file.totals.statements.covered, file.totals.statements.total) ?? 101;
        list.sort((a, b) => share(a) - share(b) || a.displayPath.localeCompare(b.displayPath));
        return list;
    }

    list.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
    return list;
}

/**
 * @param {FileReport[]} files
 * @returns {Totals} Sum of every file's counters.
 */
export function sumTotals(files) {
    /** @type {Totals} */
    const totals = {
        statements: { covered: 0, total: 0 },
        branches: { covered: 0, total: 0 },
        functions: { covered: 0, total: 0 },
    };

    /** @type {(keyof Totals)[]} */
    const keys = ['statements', 'branches', 'functions'];
    for (const file of files) {
        for (const key of keys) {
            totals[key].covered += file.totals[key].covered;
            totals[key].total += file.totals[key].total;
        }
    }

    return totals;
}

/**
 * Assign the per-run `G1..GN` labels that both the prose and the JSON use.
 * Living here keeps the two renderers from disagreeing about numbering.
 * @param {FileReport[]} files
 * @returns {LabeledGap[]}
 */
export function assignLabels(files) {
    /** @type {LabeledGap[]} */
    const labeled = [];
    let counter = 0;

    for (const file of files) {
        for (const gap of file.gaps) {
            counter += 1;
            labeled.push({ label: 'G' + counter, file, gap });
        }
    }

    return labeled;
}
