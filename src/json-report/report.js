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
import { groupRegions, labelRange } from './regions.js';
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
        // Reportable items, not gaps: a never-called function sends the reader
        // to a section just as a gap does. The old count printed `0` for a file
        // that then had a `Never called:` line in its body — the summary said
        // clean, the details said dirty, and a reader who stopped at the table
        // was misled.
        String(file.gaps.length + file.uncoveredFunctions.length),
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
        code('// 12 ← BRANCH 1/1') +
            ' — the line holds a branch with at least one arm that never executed.',
    ];
}

/**
 * The `Never called:` run-on line for one file.
 *
 * The function counter is independent of the statement and the arm counters: a
 * no-op callback or an empty method has `f === 0` and contributes no gap, so
 * this line used to name code the document never printed, and the reader could
 * not tell "the snippet is three sections down" from "there is nothing to show".
 *
 * A region is found by matching the function span, not by asking whether the
 * reported line falls inside the window: a long function is capped at
 * `--max-lines`, and the window then legitimately starts below the declaration.
 * `win.fn` names the enclosing function for the whole window, cut or not.
 * @param {FileReport} file
 * @param {Region[]} regions Regions already grouped for this file.
 * @returns {string}
 */
function neverCalledNote(file, regions) {
    const parts = file.uncoveredFunctions.map(fn => {
        const where = fn.line === null ? '' : ' (line ' + fn.line + ')';
        const body = code(fn.name) + where;

        // Copied to a local first: TypeScript re-widens a property inside a
        // callback, because `fn.line` is not a constant from the compiler's
        // point of view — the closure could observe a later write.
        const line = fn.line;
        const covering =
            line === null
                ? undefined
                : regions.find(region => {
                      const span = region.win.fn;
                      return span !== null && span.declLine === line;
                  });

        if (covering !== undefined) {
            return body + ' — see ' + labelRange(covering.gaps.map(item => item.label));
        }

        // No region means no block gap and no branch gap inside the body, which
        // is exactly what there would be to print. Saying it outright beats
        // leaving the reader to hunt for a snippet that does not exist — and a
        // duplicate `fnMap` entry for the same arrow looks the same from here.
        return body + ' — nothing to print';
    });

    // `; ` rather than `, `: each part may carry its own clause, and a comma
    // would fuse two of them into one sentence.
    return 'Never called: ' + parts.join('; ');
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

    // `Dirty` only when a revision is known: without one, "no dirty files" would
    // claim the tree was checked and clean, which is exactly what we cannot say.
    if (provenance.revision !== null) {
        const dirty =
            provenance.dirty.length === 0
                ? 'none'
                : provenance.dirty.length + ' file(s) — ' + provenance.dirty.map(code).join(', ');
        push('Dirty: ' + dirty);
    }

    // Blank line between the revision block and the timestamp, and exactly one
    // after it. Pushing the blank inside the conditional left the timestamp
    // glued to `Dirty` and doubled the gap before the table.
    push('');

    if (provenance.generated !== null) {
        push('Generated: ' + code(provenance.generated), '');
    }

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

    // Regions are computed once: the section loop needs them, and so does
    // `Never called`, which cites the region that prints a function's body.
    /** @type {Array<{ file: FileReport, regions: Region[] }>} */
    const sections = files.map(file => {
        const fileGaps = labeled.filter(item => item.file === file);
        return {
            file,
            regions: fileGaps.length === 0 ? [] : groupRegions(fileGaps, contextLines, maxLines),
        };
    });

    if (labeled.length === 0 && uncalled === 0) {
        push('No uncovered lines, branches or functions were found in the selected scope.', '');
    } else {
        // The leading number is the sum of the parenthetical, and the same sum
        // as the `Gaps` column in the table. A reader who adds the column up
        // must land on this number — that is the check the arithmetic is for.
        push(
            'Gaps: ' +
                (labeled.length + uncalled) +
                ' (' +
                blockCount +
                ' line blocks, ' +
                branchCount +
                ' branches' +
                (uncalled > 0
                    ? ', ' + uncalled + ' never-called function' + (uncalled === 1 ? '' : 's')
                    : '') +
                ')',
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
            '- Gap bullets read ' +
                code('line 343') +
                '; the 0-based column is added as ' +
                code('col 22') +
                ' only where two gaps share a line and it is the only thing telling them apart.'
        );
        push(
            '- A block bullet may end with ' +
                code('says `…`') +
                ' — the first string literal inside the uncovered lines. It is usually the error ' +
                'message, which is both the meaning and the best key to grep for in the tests.'
        );
        push(
            '- ' +
                code('· in `catch`') +
                ' and ' +
                code('· in `finally`') +
                ' mark a gap inside those clauses. They are the two cases that split into "a ' +
                'negative test is missing" and "unreachable by contract": decide which before writing code.'
        );
        push(
            '- A heading that says ' +
                code('no enclosing function') +
                ' marks a gap outside every span in `fnMap`: an arrow in a class field, ' +
                'module-level code, or a location v8 reported on a line that belongs to no function. ' +
                'These are the gaps that need a decision rather than a test.'
        );
        push(
            '- ' +
                code('Never called:') +
                ' names functions whose call counter is zero. A function the document prints ' +
                'already is cited by its gap labels; one marked ' +
                code('nothing to print') +
                ' has no uncovered statement or branch in its body, so there is no snippet to expect.'
        );
        push(
            '- Gaps that share one snippet are listed under a single heading, so ' +
                code('G13–G16') +
                ' means four gaps inside the same window; the code is printed once, under the list.'
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
                '`right operand of ??` rather than `arm 2 of 2`; when not one arm ran, the ' +
                'bullet says `no arm ever executed` instead of listing them.'
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
            push(neverCalledNote(file, fileRegions), '');
        }

        if (file.sourceLines === null) {
            push(
                '> Source file is not readable on disk, so snippets are omitted. Line numbers below still come from the coverage report.',
                ''
            );
        }

        for (const region of fileRegions) {
            push(...renderRegion(region, highlight));
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
