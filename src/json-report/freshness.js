// @ts-check

/**
 * Ageing check: did the source change after the coverage run?
 *
 * The SHA-256 column cannot answer this. It is computed from the file that is
 * printed in the snippet, in the same pass, so it always matches by
 * construction — it says "this is the file I showed you", never "this is the
 * file that was measured". A run can therefore print a flawless-looking report
 * whose line numbers point at code that has since moved, and nothing in the
 * document would look wrong. Comparing modification times is the only signal
 * available without re-running the tests.
 */

import { statSync } from 'node:fs';

/** @typedef {import('./types.js').FileReport} FileReport */
/** @typedef {import('./types.js').Freshness} Freshness */

/**
 * Filesystem timestamps are coarse — a save in the same second as the report
 * is not evidence of staleness. One second is the worst resolution seen on
 * common file systems (FAT, some network mounts).
 */
export const GRACE_MS = 1000;

/**
 * Compare the report's mtime with the mtime of every source it describes.
 *
 * A source that could not be read has no mtime and is skipped rather than
 * counted as stale: absence of data is not evidence of a change.
 * @param {string} reportPath
 * @param {FileReport[]} files
 * @returns {Freshness}
 */
export function checkFreshness(reportPath, files) {
    /** @type {number | null} */
    let reportMs = null;
    try {
        reportMs = statSync(reportPath).mtimeMs;
    } catch {
        // A report we cannot stat cannot be judged; staying silent is better
        // than warning on an unknown.
        return { reportTime: null, stale: [], checked: 0 };
    }

    /** @type {string[]} */
    const stale = [];
    let checked = 0;

    for (const file of files) {
        if (file.mtimeMs === null) {
            continue;
        }
        checked += 1;
        if (file.mtimeMs > reportMs + GRACE_MS) {
            stale.push(file.displayPath);
        }
    }

    return {
        reportTime: new Date(reportMs).toISOString(),
        stale,
        checked,
    };
}
