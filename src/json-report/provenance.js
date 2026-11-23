/**
 * Where did this coverage run come from? Git revision, dirty files and a
 * timestamp, all optional and all failure-tolerant: no git, no repository
 * or a shallow clone degrades the header instead of failing the run.
 */

import { execFileSync } from 'node:child_process';

/** @typedef {import('./types.js').Provenance} Provenance */

/**
 * Run git and return trimmed stdout, or null when git is unusable.
 * @param {string[]} args
 * @returns {string | null}
 */
export function git(args) {
    try {
        return execFileSync('git', args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
        }).trim();
    } catch {
        return null;
    }
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
        const status = git(['status', '--porcelain']);
        if (status) {
            dirty = status
                .split('\n')
                .map(line => line.slice(3).trim())
                .filter(line => line.length > 0);
        }
    }

    return {
        revision,
        dirty,
        generated: withTimestamp ? new Date().toISOString() : null,
    };
}
