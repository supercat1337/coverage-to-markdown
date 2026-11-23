// @ts-check

/**
 * Rendering one group of gaps as a Markdown section: heading, a compact list of
 * the gaps, and the code they share printed once.
 *
 * A section is a *region*, not a gap. Four uncovered branches inside one
 * function used to produce four identical sixty-line snippets; now they produce
 * one heading, four bullets and one snippet — which is also the shape in which
 * they get fixed: together.
 */

import { armDescriptors, isPhantomLine } from './branches.js';
import { BT, code, locationLabel } from './format.js';
import { labelRange } from './regions.js';
import { renderWindowBlock } from './snippet.js';

/** @typedef {import('./types.js').ArmDescriptor} ArmDescriptor */
/** @typedef {import('./types.js').HighlightMode} HighlightMode */
/** @typedef {import('./types.js').LabeledGap} LabeledGap */
/** @typedef {import('./types.js').Region} Region */

/**
 * `line 12` for a one-line span, `lines 12–34` otherwise.
 * @param {number} from
 * @param {number} to
 * @returns {string}
 */
function linesLabel(from, to) {
    return from === to ? 'line ' + from : 'lines ' + from + '–' + to;
}

/**
 * `role (operand)`, or the bare role when the source text is unavailable.
 *
 * `arm N of M` is what the analyser reports when it cannot name the operator.
 * Repeated next to the code it reads as "arm 1 of 1 (`: String(error)`)", which
 * says nothing the bullet does not already say, so the operand stands alone.
 * @param {ArmDescriptor} descriptor
 * @returns {string}
 */
function armPhrase(descriptor) {
    // A hand-written or third-party report can name a missing arm that has no
    // descriptor. One broken bullet must not take the whole document down.
    if (descriptor === undefined) {
        return 'the arm';
    }

    const generic = /^arm \d+ of \d+$/.test(descriptor.role);

    if (descriptor.operand === null) {
        return generic ? 'the arm' : descriptor.role;
    }

    const quoted = '(' + BT + descriptor.operand + BT + ')';
    return generic ? quoted : descriptor.role + ' ' + quoted;
}

/**
 * Heading of one region: `G13–G16 · in selectFiles · lines 21–80 · 4 gaps`.
 * The count is omitted when the region holds a single gap, so the common case
 * stays as short as the old per-gap heading.
 * @param {Region} region
 * @returns {string}
 */
export function regionHeading(region) {
    const cut = region.win.before !== null || region.win.after !== null || region.holes.length > 0;
    return (
        '### ' +
        labelRange(region.gaps.map(item => item.label)) +
        ' · in ' +
        code(region.win.fn?.name ?? '?') +
        ' · ' +
        linesLabel(region.win.from, region.win.to) +
        (cut ? ' (excerpt)' : '')
    );
}

/**
 * One bullet per gap. Nested bullets appear only when a branch has several
 * missing arms; the single-arm case, which is the vast majority, stays one line.
 * @param {LabeledGap} item
 * @returns {string[]}
 */
export function renderGapLine(item) {
    const gap = item.gap;

    if (gap.kind === 'block') {
        const noun = gap.statements === 1 ? 'statement' : 'statements';
        return [
            '- **' +
                item.label +
                '** ' +
                linesLabel(gap.start, gap.end) +
                ' · block · ' +
                gap.statements +
                ' ' +
                noun +
                ' never executed',
        ];
    }

    const descriptors = armDescriptors(item.file, gap);
    const missing = gap.missingArms;
    const head = '- **' + item.label + '** ' + locationLabel(gap) + ' · ' + code(gap.type) + ' · ';

    // No "only arm" prefix: with one arm it adds nothing, and next to a
    // recovered operator it read as "only arm right operand of ??".
    if (missing.length === 1) {
        const phrase = armPhrase(descriptors[missing[0] - 1]);
        return [head + phrase + ' never executed'];
    }

    const summary =
        missing.length === gap.arms.length
            ? 'no arm ever executed'
            : 'arms ' + missing.join(', ') + ' of ' + gap.arms.length + ' never executed';

    /** @type {string[]} */
    const lines = [head + summary];
    for (const armIndex of missing) {
        lines.push(
            '  - arm ' +
                armIndex +
                ' of ' +
                gap.arms.length +
                ' — ' +
                armPhrase(descriptors[armIndex - 1])
        );
    }
    return lines;
}

/**
 * Warning that a reported line holds no code, collected once per region.
 * @param {Region} region
 * @returns {string[]}
 */
function phantomNote(region) {
    const labels = region.gaps
        .filter(item => item.gap.kind === 'branch' && isPhantomLine(region.file, item.gap.line))
        .map(item => item.label);

    if (labels.length === 0) {
        return [];
    }

    return [
        '> ' +
            labelRange(labels) +
            ': the reported line holds no code. This is most likely a v8-to-istanbul ' +
            'artefact around an implicit `else`, `default` or class field; ' +
            'treat it as noise before writing a test.',
        '',
    ];
}

/**
 * Whether this region needs its own snippet.
 *
 * A branch that sits on a line already shown as an uncovered block adds nothing
 * by repeating the code; when it shares the block's window the two merge and
 * the question does not arise, but it can sit in a different function.
 * @param {Region} region
 * @returns {boolean}
 */
function regionOwnsSnippet(region) {
    return region.gaps.some(
        item => item.gap.kind === 'block' || !region.file.blockLines.has(item.gap.line)
    );
}

/**
 * One region: heading, the list of its gaps, then the code they share.
 * @param {Region} region
 * @param {HighlightMode} highlight
 * @param {string | null} [alsoIn] Cross-file note, see `duplicateNote` in
 * `report.js`. `null` when the same code appears nowhere else.
 * @returns {string[]}
 */
export function renderRegion(region, highlight, alsoIn = null) {
    /** @type {string[]} */
    const lines = [regionHeading(region), ''];

    for (const item of region.gaps) {
        lines.push(...renderGapLine(item));
    }
    lines.push('');

    lines.push(...phantomNote(region));

    if (alsoIn !== null) {
        lines.push(alsoIn, '');
    }

    if (regionOwnsSnippet(region)) {
        lines.push(...renderWindowBlock(region.file, region.win, highlight, region.holes));
    }

    return lines;
}
