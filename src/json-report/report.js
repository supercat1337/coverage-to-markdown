// @ts-check

/**
 * Assembling the whole Markdown document: provenance header, per-file table,
 * gap sections, and the lists of files with nothing to report.
 *
 * There is no machine-readable appendix here on purpose. The raw istanbul
 * JSON is already the source of truth for programs, and a second copy inside
 * a human-readable document only raised the question of which copy to trust
 * while doubling the reading time. `--json` writes the same gaps to a
 * separate file for anyone who needs data instead of prose.
 */

import { code, metricLine, percentText } from './format.js';
import { groupRegions, labelRange, regionHash } from './regions.js';
import { renderRegion } from './render.js';

/**
 * Above this many stale files the warning summarises instead of listing: when
 * nearly everything is stale, the list stops being information and becomes
 * scrollback.
 */
const STALE_LISTED = 5;

/** @typedef {import('./types.js').FileReport} FileReport */
/** @typedef {import('./types.js').HighlightMode} HighlightMode */
/** @typedef {import('./types.js').LabeledGap} LabeledGap */
/** @typedef {import('./types.js').Metric} Metric */
/** @typedef {import('./types.js').Region} Region */
/** @typedef {import('./types.js').ReportOptions} ReportOptions */

/**
 * @param {FileReport} file
 * @returns {string} Row of the per-file table.
 */
function fileTableRow(file) {
    const cells = [
        code(file.displayPath),
        file.sha256 === null ? '—' : code(file.sha256),
        file.totals.statements.covered + '/' + file.totals.statements.total,
        file.totals.branches.covered + '/' + file.totals.branches.total,
        file.totals.functions.covered + '/' + file.totals.functions.total,
        String(file.gaps.length),
    ];
    return '| ' + cells.join(' | ') + ' |';
}

/**
 * @param {HighlightMode} highlight
 * @returns {string[]} Bullet lines explaining the markers.
 */
function legend(highlight) {
    if (highlight === 'gutter') {
        return [
            code('>') +
                ' in the gutter marks a line that belongs to a gap; the trailing note names the kind.',
        ];
    }
    if (highlight === 'none') {
        return [
            'Snippets carry only line-number comments; the gap kind is stated in each section heading.',
        ];
    }
    return [
        code('// 176 ← UNCOVERED') + ' — the line never executed.',
        code('// 12 ← BRANCH 2/2') + ' — the line holds a branch whose arm 2 of 2 never executed.',
    ];
}

/**
 * Grouping of regions by rendered source text, so a function copied into two
 * files is reported once as a duplication instead of twice as two problems.
 * @param {Region[]} regions
 * @returns {Map<string, Region[]>}
 */
function groupByBody(regions) {
    /** @type {Map<string, Region[]>} */
    const byBody = new Map();

    for (const region of regions) {
        const hash = regionHash(region);
        if (hash === null) {
            continue;
        }
        const bucket = byBody.get(hash);
        if (bucket === undefined) {
            byBody.set(hash, [region]);
        } else {
            bucket.push(region);
        }
    }

    return byBody;
}

/**
 * `> The same code appears in ...` for a region whose snippet is a duplicate,
 * `null` otherwise. Stated on every occurrence, so either section is enough to
 * learn that one test closes both.
 * @param {Region} region
 * @param {Map<string, Region[]>} byBody
 * @returns {string | null}
 */
function duplicateNote(region, byBody) {
    const hash = regionHash(region);
    if (hash === null) {
        return null;
    }

    const bucket = byBody.get(hash);
    if (bucket === undefined || bucket.length < 2) {
        return null;
    }

    const others = bucket
        .filter(other => other !== region)
        .map(
            other =>
                code(other.file.displayPath) + ' ' + labelRange(other.gaps.map(item => item.label))
        );

    return (
        '> The same code appears in ' +
        others.join(' and ') +
        '; a single test closes every gap listed there.'
    );
}

/**
 * @param {ReportOptions} options
 * @returns {string} The complete Markdown document.
 */
export function buildReport(options) {
    const {
        title,
        reportDisplay,
        scopeText,
        files,
        labeled,
        totals,
        contextLines,
        maxLines,
        highlight,
        provenance,
        // A caller that predates the staleness check, or a test that builds
        // options by hand, must not crash: "unknown" is the honest default, and
        // it prints nothing.
        freshness = { reportTime: null, stale: [], checked: 0 },
    } = options;

    /** @type {string[]} */
    const out = [];
    /** @type {(...lines: string[]) => void} */
    const push = (...lines) => {
        out.push(...lines);
    };

    // --- header ---------------------------------------------------------
    push('# ' + title, '');
    push('Report: ' + code(reportDisplay), '');
    push('Scope: ' + scopeText, '');
    // Printed even without git: the reader must be able to tell "this document
    // was generated outside a repository" from "this document forgot to say".
    push(
        'Revision: ' +
            (provenance.revision === null ? '— (git unavailable)' : code(provenance.revision))
    );
    
    if (provenance.revision !== null) {
        const dirty =
            provenance.dirty.length === 0
                ? 'none'
                : provenance.dirty.length + ' file(s) — ' + provenance.dirty.map(code).join(', ');
        push('Dirty: ' + dirty);
    }

    if (provenance.generated !== null) {
        push('Generated: ' + code(provenance.generated), '');
    }
    push('');

    if (freshness.stale.length > 0) {
        const listed = freshness.stale.slice(0, STALE_LISTED).map(code).join(', ');
        const rest =
            freshness.stale.length > STALE_LISTED
                ? ' and ' + (freshness.stale.length - STALE_LISTED) + ' more'
                : '';
        push(
            '> **Stale coverage:** ' +
                freshness.stale.length +
                ' of ' +
                freshness.checked +
                ' source file(s) changed after this report was written — ' +
                listed +
                rest +
                '.',
            '> Line numbers below may point at code that has since moved. Regenerate before ' +
                'trusting a snippet, for example: `npx c8 --all --reporter=json ava`.',
            ''
        );
    }

    // --- totals ---------------------------------------------------------
    push('| Metric | Covered | Total | Percent |', '| --- | ---: | ---: | ---: |');
    /** @type {[string, Metric][]} */
    const metricRows = [
        ['Statements', totals.statements],
        ['Branches', totals.branches],
        ['Functions', totals.functions],
    ];
    for (const [name, value] of metricRows) {
        push(
            '| ' +
                name +
                ' | ' +
                value.covered +
                ' | ' +
                value.total +
                ' | ' +
                percentText(value.covered, value.total) +
                ' |'
        );
    }
    push('');

    // --- per-file table -------------------------------------------------
    push('## Files in scope', '');
    push(
        '| File | SHA-256 (12) | Stmts | Branch | Funcs | Gaps |',
        '| --- | --- | ---: | ---: | ---: | ---: |'
    );
    for (const file of files) {
        push(fileTableRow(file));
    }
    push('');
    push(
        'A file whose hash matches the source you have is the one this report describes. ' +
            'A `0/0` row means the file has no executable statements.',
        ''
    );

    // --- gap summary and reading guide ----------------------------------
    let blockCount = 0;
    let branchCount = 0;
    let uncalled = 0;
    for (const file of files) {
        uncalled += file.uncoveredFunctions.length;
        for (const gap of file.gaps) {
            if (gap.kind === 'block') {
                blockCount += 1;
            } else {
                branchCount += 1;
            }
        }
    }

    // Regions are computed once: the section loop needs them, and so does the
    // duplicate scan, which has to see every file at the same time.
    /** @type {Array<{ file: FileReport, regions: Region[] }>} */
    const sections = files.map(file => {
        const fileGaps = labeled.filter(item => item.file === file);
        return {
            file,
            regions: fileGaps.length === 0 ? [] : groupRegions(fileGaps, contextLines, maxLines),
        };
    });
    const byBody = groupByBody(sections.flatMap(section => section.regions));

    if (labeled.length === 0 && uncalled === 0) {
        push('No uncovered lines, branches or functions were found in the selected scope.', '');
    } else {
        push(
            'Gaps: ' +
                labeled.length +
                ' (' +
                blockCount +
                ' line blocks, ' +
                branchCount +
                ' branches)' +
                (uncalled > 0 ? ', ' + uncalled + ' never-called function(s)' : ''),
            ''
        );

        push('## How to read this file', '');
        push(
            '- Gap labels ' +
                code('G1') +
                ', ' +
                code('G2') +
                ', ... are assigned per run and shift when lines change; do not treat them as stable identifiers.'
        );
        for (const item of legend(highlight)) {
            push('- ' + item);
        }
        push(
            '- Locations use ' +
                code('line:column') +
                ' with a 0-based column, as in the istanbul JSON.'
        );
        push(
            '- Gaps that share one snippet are listed under a single heading, so ' +
                code('G13–G16') +
                ' means four gaps inside the same window; the code is printed once, under the list.'
        );
        push(
            '- A `> The same code appears in ...` note marks a snippet that is byte-identical ' +
                'to one in another file: extract it, and one test closes every gap it names.'
        );
        push(
            '- Snippets are cut to the enclosing function taken from `fnMap`, expanded ' +
                'upwards through its JSDoc block, and capped at ' +
                maxLines +
                ' lines; anything cut is reported as "Lines a–b omitted", and the heading ' +
                'then says `(excerpt)`.'
        );
        push(
            '- Branch arms are numbered from 1. When the source is readable the operator ' +
                'between arms is recovered from the text, so an arm reads as ' +
                '`right operand of ??` rather than `arm 2 of 2`.'
        );
        push(
            '- This document is deliberately human-oriented. Pass ' +
                code('--json <path>') +
                ' to write the same gaps as a separate JSON file.',
            ''
        );
    }

    // --- per-file sections -----------------------------------------------
    for (const { file, regions: fileRegions } of sections) {
        if (fileRegions.length === 0 && file.uncoveredFunctions.length === 0) {
            continue;
        }

        push('## ' + code(file.displayPath), '');
        push(metricLine(file.totals), '');

        if (file.uncoveredFunctions.length > 0) {
            /** @type {string[]} */
            const names = file.uncoveredFunctions.map(
                fn => code(fn.name) + (fn.line === null ? '' : ' (line ' + fn.line + ')')
            );
            push('Never called: ' + names.join(', '), '');
        }

        if (file.sourceLines === null) {
            push(
                '> Source file is not readable on disk, so snippets are omitted. Line numbers below still come from the coverage report.',
                ''
            );
        }

        for (const region of fileRegions) {
            push(...renderRegion(region, highlight, duplicateNote(region, byBody)));
        }
    }

    // --- files with nothing to report ------------------------------------
    /** @type {FileReport[]} */
    const clean = [];
    /** @type {FileReport[]} */
    const empty = [];

    for (const file of files) {
        const noCode =
            file.totals.statements.total === 0 &&
            file.totals.branches.total === 0 &&
            file.totals.functions.total === 0;

        if (noCode) {
            empty.push(file);
        } else if (file.gaps.length === 0 && file.uncoveredFunctions.length === 0) {
            clean.push(file);
        }
    }

    if (clean.length > 0) {
        push('## Fully covered files', '');
        for (const file of clean) {
            push('- ' + code(file.displayPath) + ' — ' + metricLine(file.totals));
        }
        push('');
    }

    if (empty.length > 0) {
        push('## Files without executable code', '');
        push(
            'These files are in the report but contain no statements, branches or functions. ' +
                'With `--all` this can also mean the module was never loaded — worth checking.',
            ''
        );
        for (const file of empty) {
            push('- ' + code(file.displayPath));
        }
        push('');
    }

    return out.join('\n');
}
