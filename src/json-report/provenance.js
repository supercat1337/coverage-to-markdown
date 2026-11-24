// @ts-check

/**
 * Where did this coverage run come from? Git revision, dirty files and a
 * timestamp, all optional and all failure-tolerant: no git, no repository
 * or a shallow clone degrades the header instead of failing the run.
 */

import { execFileSync } from 'node:child_process';

/** @typedef {import('./types.js').Provenance} Provenance */

/**
 * Run git and return its stdout without the trailing newline, or `null` when
 * git is unusable.
 *
 * `trimEnd`, never `trim`. `git status --porcelain` starts a modified entry
 * with a space — `" M README.md"` — and that space is data: the first of the
 * three status columns. `trim()` ate it, `parseDirtyStatus` then removed the
 * first three characters of what was left, and the header printed `EADME.md`.
 * Only the final newline needs removing.
 * @param {string[]} args
 * @returns {string | null}
 */
export function git(args) {
    try {
        return execFileSync('git', args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
        }).trimEnd();
    } catch {
        return null;
    }
}

/**
 * Turn `git status --porcelain` output into display paths.
 *
 * Each line is two status columns and a space, then the path: `XX path`. The
 * path may itself contain spaces, so only the first three characters are
 * dropped. A rename arrives as `old -> new` and is kept verbatim — splitting it
 * would need `--porcelain=v2`, and the dirty list is a hint for a human, not a
 * machine-readable index.
 *
 * Exported and pure so the transformation can be tested without a repository:
 * the previous version parsed inside `readProvenance`, and its test looped over
 * a live `git status`, which made it green only while the working tree happened
 * to be dirty.
 * @param {string | null} status
 * @returns {string[]}
 */
export function parseDirtyStatus(status) {
    if (!status) {
        return [];
    }

    return status
        .split('\n')
        .map(line => line.slice(3).trim())
        .filter(line => line.length > 0);
}

/**
 * @param {boolean} withGit Read the revision and the dirty list.
 * @param {boolean} withTimestamp Read the current time.
 * @returns {Provenance}
 */
export function readProvenance(withGit, withTimestamp) {
    /** @type {string | null} */
    let revision = null;
    /** @type {string[]} */
    let dirty = [];

    if (withGit) {
        revision = git(['rev-parse', '--short', 'HEAD']);
        dirty = parseDirtyStatus(git(['status', '--porcelain']));
    }

    return {
        revision,
        dirty,
        generated: withTimestamp ? new Date().toISOString() : null,
    };
}
