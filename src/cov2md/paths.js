// @ts-check

/**
 * Path helpers and the pre-flight guards.
 *
 * Every guard runs before a single byte is written: a wrong `--output` must
 * fail while the source file is still intact.
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/**
 * Take the final path component regardless of the separator style.
 * @param {string} filePath
 * @returns {string}
 */
export function basenameOf(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Display a path relative to the current working directory with forward
 * slashes, so the document is portable and leaks no local structure.
 * @param {string} absPath
 * @returns {string}
 */
export function toDisplayPath(absPath) {
    const rel = relative(process.cwd(), absPath);
    if (rel === '' || isAbsolute(rel)) {
        return absPath.replace(/\\/g, '/');
    }
    return rel.replace(/\\/g, '/');
}

/**
 * Resolve every symlink and junction so that two names for one file cannot
 * pass the input/output collision check.
 *
 * A path that does not exist yet resolves to itself, which is the right answer
 * for the `--output` file the caller is about to create; `realpathSync` would
 * throw there. On a case-insensitive file system the two real paths may still
 * differ in case, so the comparison is normalised as well.
 * @param {string} filePath
 * @returns {string}
 */
function identityOf(filePath) {
    /** @type {string} */
    let resolved;
    try {
        resolved = realpathSync(filePath);
    } catch {
        resolved = resolve(filePath);
    }
    /* c8 ignore next -- platform branch: covered on the platform that runs it */
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Refuse a run that could destroy the input or silently overwrite output.
 * @param {string} sourcePath
 * @param {string} outputPath
 * @param {boolean} force
 * @returns {void}
 */
export function guardFilePaths(sourcePath, outputPath, force) {
    if (identityOf(sourcePath) === identityOf(outputPath)) {
        throw new Error(
            '--input and --output must point at different files. ' +
                'Refusing to overwrite the source file.'
        );
    }
    if (!existsSync(sourcePath)) {
        throw new Error('Input file not found: ' + sourcePath);
    }
    if (!statSync(sourcePath).isFile()) {
        throw new Error('Input path is not a regular file: ' + sourcePath);
    }
    if (existsSync(outputPath) && !force) {
        throw new Error(
            'Output file already exists: ' + outputPath + '. Pass --force to overwrite it.'
        );
    }
}

/**
 * @param {string} outputPath
 * @returns {void}
 */
export function guardOutputDirectory(outputPath) {
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
        throw new Error(
            'Output directory does not exist: ' +
                outputDir +
                '. Create it first, or choose a different --output path.'
        );
    }
}
