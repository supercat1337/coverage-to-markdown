// @ts-check

/**
 * Parsing and normalising coverage range strings.
 */

/** @typedef {import('./types.js').Range} Range */

/**
 * Parse a coverage range string into an array of ranges.
 * Does not merge overlapping or adjacent ranges.
 * @param {string} input
 * @returns {Range[]} Ranges in the order they appear in the string.
 */
export function parseRanges(input) {
    return input
        .split(',')
        .map(segment => segment.trim())
        .filter(segment => segment.length > 0)
        .map(segment => parseRangeSegment(segment));
}

/**
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
        throw new Error('Invalid range (end < start): "' + segment + '"');
    }

    return { start, end };
}

/**
 * @param {string} raw
 * @returns {number}
 */
function parseLineNumber(raw) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error('Invalid line number: "' + raw + '"');
    }
    return value;
}

/**
 * Sort ranges and merge overlapping or directly adjacent ones.
 * @param {Range[]} ranges
 * @returns {Range[]} Merged ranges, sorted by start.
 */
export function normalizeRanges(ranges) {
    if (!Array.isArray(ranges) || ranges.length === 0) {
        return [];
    }

    const sorted = ranges.slice().sort((a, b) => a.start - b.start || a.end - b.end);
    /** @type {Range[]} */
    const merged = [{ start: sorted[0].start, end: sorted[0].end }];

    for (let i = 1; i < sorted.length; i += 1) {
        const last = merged[merged.length - 1];
        const current = sorted[i];

        if (current.start <= last.end + 1) {
            if (current.end > last.end) {
                last.end = current.end;
            }
        } else {
            merged.push({ start: current.start, end: current.end });
        }
    }

    return merged;
}
