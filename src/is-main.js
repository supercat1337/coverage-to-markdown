// @ts-check

/**
 * Whether the module at `moduleUrl` was started as the main script.
 *
 * Lives in its own module because two entry points need it — the `cov2md` bin
 * and the `covgaps` bin — and the copy in each was byte-identical. The
 * duplication was visible in the coverage report itself, which printed a
 * cross-file note over the two copies.
 *
 * Compares real (symlink-resolved) paths rather than file URLs, because on
 * Windows `process.argv[1]` and `import.meta.url` can disagree on drive-letter
 * case, on short (8.3) names, and on junction resolution when launched through
 * an npm bin shim (`npm link`). `path.relative` compares case-insensitively on
 * Windows and case-sensitively elsewhere, so no platform branch is needed.
 */

import { realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string} moduleUrl `import.meta.url` of the calling module.
 * @returns {boolean}
 */
export function isMainModule(moduleUrl) {
    const entry = process.argv[1];
    if (entry === undefined) {
        return false;
    }

    try {
        const selfPath = realpathSync(fileURLToPath(moduleUrl));
        const entryPath = realpathSync(resolve(entry));
        return relative(selfPath, entryPath) === '';
    } catch {
        // A path that cannot be resolved is not this module: a deleted entry
        // file, a `file:` URL that is not a file, or a broken symlink.
        return false;
    }
}
