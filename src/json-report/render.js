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
import { BT, code, inlineCode, locationLabel } from './format.js';
import { labelRange } from './regions.js';
import { renderWindowBlock } from './snippet.js';
import { enclosingClause, firstLiteral } from './source.js';

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
 * ` · in `catch`` when the gap sits inside a `catch` or `finally`, empty
 * otherwise.
 *
 * These two clauses are the single most useful classification in the document:
 * they make up about four gaps in ten in real code, and they split cleanly into
 * "a negative test is missing" and "unreachable by contract, mark it skipped" —
 * two different actions that look identical without this note.
 * @param {LabeledGap} item
 * @param {number} line 1-based line inside the block.
 * @returns {string}
 */
function clauseNote(item, line) {
    const sourceLines = item.file.sourceLines;
    if (sourceLines === null) {
        return '';
    }
    const clause = enclosingClause(sourceLines, line);
    return clause === null ? '' : ' · in ' + code(clause);
}

/**
 * Heading of one region: `G13–G16 · in selectFiles · lines 21–80 (excerpt)`.
 * @param {Region} region
 * @returns {string}
 */
export function regionHeading(region) {
    const cut = region.win.before !== null || region.win.after !== null || region.holes.length > 0;

    // No span in `fnMap` covers this window. That is not missing data — it is
    // the one case where the reader has to decide something: an arrow in a
    // class field, module-level code, or a location v8 reported on a line that
    // belongs to no function. Naming it `?` buried the signal; naming it
    // outright turns it into the label it deserves.
    const owner = region.win.fn === null ? 'no enclosing function' : code(region.win.fn.name);

    return (
        '### ' +
        labelRange(region.gaps.map(item => item.label)) +
        ' · in ' +
        owner +
        ' · ' +
        linesLabel(region.win.from, region.win.to) +
        (cut ? ' (excerpt)' : '')
    );
}

/**
 * One bullet per gap. Nested bullets appear only when a branch has several
 * missing arms out of more than one; the single-arm case, which is the vast
 * majority, stays one line.
 *
 * The order of the three cases is load-bearing. `missing.length === 1` comes
 * first so a one-armed branch — `if (x)`, `catch`, a `?.` — keeps its operand
 * phrase; an "every arm" check placed before it swallows that phrase and
 * leaves the reader with nothing but "the branch never ran".
 * @param {LabeledGap} item
 * @param {Set<number>} [sharedLines] Lines that carry more than one branch gap
 * in this region; the column is printed only there.
 * @returns {string[]}
 */
export function renderGapLine(item, sharedLines = new Set()) {
    const gap = item.gap;

    if (gap.kind === 'block') {
        const noun = gap.statements === 1 ? 'statement' : 'statements';

        // An uncovered block is usually an error path, and an error path's whole
        // identity is its message. `'cache.init failed'` tells the reader what
        // the code does and what to grep for in `tests/`; `lines 624–626` tells
        // them only where to look.
        const sourceLines = item.file.sourceLines;
        const literal = sourceLines === null ? null : firstLiteral(sourceLines, gap.start, gap.end);

        return [
            '- **' +
                item.label +
                '** ' +
                linesLabel(gap.start, gap.end) +
                ' · block · ' +
                gap.statements +
                ' ' +
                noun +
                ' never executed' +
                (literal === null ? '' : ' · says ' + inlineCode(literal)) +
                clauseNote(item, gap.start),
        ];
    }

    const descriptors = armDescriptors(item.file, gap);
    const missing = gap.missingArms;
    const where = sharedLines.has(gap.line) ? locationLabel(gap) : 'line ' + gap.line;
    const tail = clauseNote(item, gap.line);
    const head = '- **' + item.label + '** ' + where + ' · ' + code(gap.type) + ' · ';

    // No "only arm" prefix: with one arm it adds nothing, and next to a
    // recovered operator it read as "only arm right operand of ??".
    if (missing.length === 1) {
        const phrase = armPhrase(descriptors[missing[0] - 1]);
        return [head + phrase + ' never executed' + tail];
    }

    const summary =
        missing.length === gap.arms.length
            ? 'no arm ever executed'
            : 'arms ' + missing.join(', ') + ' of ' + gap.arms.length + ' never executed';

    /** @type {string[]} */
    const lines = [head + summary + tail];
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
 * Lines that hold more than one branch gap in this region.
 *
 * The column exists to tell two gaps on one line apart. Everywhere else it
 * repeated `col 0` and `col 22` on millions of bullets and cost the reader a
 * token per line for no information.
 * @param {Region} region
 * @returns {Set<number>}
 */
function sharedLineSet(region) {
    /** @type {Map<number, number>} */
    const counts = new Map();

    for (const item of region.gaps) {
        if (item.gap.kind !== 'branch') {
            continue;
        }
        counts.set(item.gap.line, (counts.get(item.gap.line) ?? 0) + 1);
    }

    /** @type {Set<number>} */
    const shared = new Set();
    for (const [line, count] of counts) {
        if (count > 1) {
            shared.add(line);
        }
    }
    return shared;
}

/**
 * One region: heading, the list of its gaps, then the code they share.
 * @param {Region} region
 * @param {HighlightMode} highlight
 * @returns {string[]}
 */
export function renderRegion(region, highlight) {
    /** @type {string[]} */
    const lines = [regionHeading(region), ''];
    const shared = sharedLineSet(region);

    for (const item of region.gaps) {
        lines.push(...renderGapLine(item, shared));
    }
    lines.push('');

    lines.push(...phantomNote(region));

    if (regionOwnsSnippet(region)) {
        lines.push(...renderWindowBlock(region.file, region.win, highlight, region.holes));
    }

    return lines;
}
