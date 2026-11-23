// @ts-check

/**
 * Grouping of gaps by the snippet they would share.
 *
 * The key is the window that `snippetWindow` already computes: two gaps with
 * the same `from` and `to` render byte-identical code, so grouping cannot
 * disagree with rendering. Function identity is deliberately not used — block
 * gaps outside any function have no `fn`, and one long function can be cut into
 * two different windows by `maxLines`.
 */

import { createHash } from 'node:crypto';

import { snippetWindow } from './snippet.js';

/** @typedef {import('./types.js').Gap} Gap */
/** @typedef {import('./types.js').LabeledGap} LabeledGap */
/** @typedef {import('./types.js').LineRange} LineRange */
/** @typedef {import('./types.js').Region} Region */

const MULTI_GAP_MAX_FUNCTION = 160;

/**
 * Inclusive span of a gap in source lines.
 * @param {Gap} gap
 * @returns {LineRange}
 */
export function gapSpan(gap) {
    if (gap.kind === 'block') {
        return { start: gap.start, end: gap.end };
    }
    return { start: gap.line, end: gap.line };
}

const HOLE_MIN_LINES = 12;

/**
 * Gaps between two reported ranges that are long enough to be worth skipping.
 *
 * `contextLines` is kept on both sides of every gap, so a hole never eats the
 * lines a reader needs to understand it. Below twelve lines the note costs more
 * than the code it hides.
 * @param {LineRange[]} spans
 * @param {number} contextLines
 * @returns {LineRange[]}
 */
function holesBetween(spans, contextLines) {
    const sorted = [...spans].sort((a, b) => a.start - b.start);
    /** @type {LineRange[]} */
    const holes = [];

    for (let i = 1; i < sorted.length; i += 1) {
        const start = sorted[i - 1].end + contextLines + 1;
        const end = sorted[i].start - contextLines - 1;
        if (end - start + 1 >= HOLE_MIN_LINES) {
            holes.push({ start, end });
        }
    }

    return holes;
}

/**
 * @param {Region} region
 * @param {number} contextLines
 * @returns {Region | null} `null` when the region cannot be covered by one
 * window: its gaps must then stay in separate sections.
 */
function widenRegion(region, contextLines) {
    if (region.gaps.length < 2) {
        return { ...region, holes: [] };
    }

    const spans = region.gaps.map(item => gapSpan(item.gap));
    const from = Math.min(...spans.map(span => span.start));
    const to = Math.max(...spans.map(span => span.end));
    const wide = snippetWindow(region.file, from, to, contextLines, MULTI_GAP_MAX_FUNCTION);

    // Outside a function the gaps have nothing in common but proximity, and a
    // function longer than the cap cannot be printed whole. Either way one
    // window would not cover every gap, so the caller must keep them apart.
    if (wide.fn === null || wide.to < to) {
        return null;
    }
    return {
        file: region.file,
        win: wide,
        gaps: region.gaps,
        holes: holesBetween(spans, contextLines),
    };
}

/**
 * Merge neighbouring gaps that share one snippet window.
 *
 * Adjacency is enough to keep this linear: `labeled` is already ordered by file
 * and by line, so a window belongs to exactly one file and runs never
 * interleave. Two gaps separated by a gap with a different window stay apart,
 * even if the later one reopens the earlier window — the only cost is one extra
 * snippet, never a wrong one.
 * @param {LabeledGap[]} labeled
 * @param {number} contextLines
 * @param {number} maxLines
 * @returns {Region[]}
 */
export function groupRegions(labeled, contextLines, maxLines) {
    /** @type {Region[]} */
    const regions = [];

    for (const item of labeled) {
        const span = gapSpan(item.gap);
        const win = snippetWindow(item.file, span.start, span.end, contextLines, maxLines);
        const last = regions[regions.length - 1];

        if (
            last !== undefined &&
            last.file === item.file &&
            last.win.from === win.from &&
            last.win.to === win.to
        ) {
            last.gaps.push(item);
            continue;
        }

        regions.push({ file: item.file, win, gaps: [item], holes: [] });
    }

    return coalesceRegions(regions, contextLines);
}

/**
 * Whether two regions sit in the same function span.
 * @param {Region} a
 * @param {Region} b
 * @returns {boolean}
 */
function sameFunction(a, b) {
    const first = a.win.fn;
    const second = b.win.fn;

    return (
        a.file === b.file &&
        first !== null &&
        second !== null &&
        first.startLine === second.startLine &&
        first.endLine === second.endLine
    );
}

/**
 * Two capped windows inside one function usually overlap: `main` produced
 * 182–261 and 205–284, with fifty-seven lines printed twice. Merge their gaps
 * and let `widenRegion` recompute one window from them.
 *
 * Only adjacent regions are compared, which is enough because `labeled` is
 * sorted by line: overlapping windows in one function are always neighbours.
 * @param {Region[]} regions
 * @param {number} contextLines
 * @returns {Region[]}
 */
function coalesceRegions(regions, contextLines) {
    /** @type {Region[]} */
    const coalesced = [];

    for (const region of regions) {
        const last = coalesced[coalesced.length - 1];

        if (
            last !== undefined &&
            sameFunction(last, region) &&
            last.win.from <= region.win.to &&
            region.win.from <= last.win.to
        ) {
            const merged = widenRegion(
                { ...last, gaps: [...last.gaps, ...region.gaps] },
                contextLines
            );
            if (merged !== null) {
                coalesced[coalesced.length - 1] = merged;
                continue;
            }
        }

        coalesced.push(widenRegion(region, contextLines) ?? region);
    }

    return coalesced;
}

/**
 * Compact label for the gaps of one region: `G7`, `G3–G6`, `G13, G15`.
 * @param {string[]} labels Labels in ascending order.
 * @returns {string}
 */
export function labelRange(labels) {
    const numbers = labels.map(label => Number(label.slice(1)));
    const contiguous = numbers.every(
        (value, index) => index === 0 || value === numbers[index - 1] + 1
    );

    if (numbers.length > 1 && contiguous) {
        return labels[0] + '–' + labels[labels.length - 1];
    }

    return labels.join(', ');
}

/**
 * Hash of the code a region reports on, used to spot one function copied into
 * two files: there the snippets are identical but the regions are not, so
 * grouping cannot see it.
 *
 * Only the function body is hashed, never the whole window: two copies of one
 * helper almost always differ in their JSDoc, and the comment belongs to the
 * excerpt, not to the logic. `null` when nothing is rendered, so source-less
 * regions never match each other.
 * @param {Region} region
 * @returns {string | null}
 */
export function regionHash(region) {
    const lines = region.file.sourceLines;
    if (lines === null || region.win.from > region.win.to) {
        return null;
    }

    const fn = region.win.fn;
    // A window can start above its function (the JSDoc climb) and end before
    // its last line (the cap), so the two are intersected. The result is never
    // empty: the gap itself lies inside both, which is why no guard is needed.
    const from = fn === null ? region.win.from : Math.max(region.win.from, fn.startLine);
    const to = fn === null ? region.win.to : Math.min(region.win.to, fn.endLine);

    const body = lines.slice(from - 1, to).join('\n');
    return createHash('sha256').update(body, 'utf8').digest('hex');
}
