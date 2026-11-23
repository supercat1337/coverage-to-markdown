/**
 * Shared helpers for the AVA suite.
 *
 * The file name starts with `_`, so AVA treats it as a helper and never
 * runs it as a test file.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the package root, without a trailing separator. */
export const projectRoot = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]+$/, '');

export const CLI_COV2MD = join(projectRoot, 'src', 'coverage-to-markdown.js');
export const CLI_COVGAPS = join(projectRoot, 'src', 'json-report', 'cli.js');
export const FIXTURES = join(projectRoot, 'tests', 'fixtures');

/**
 * Create a temporary directory that is removed when the test ends.
 * @param {import('ava').ExecutionContext} t
 * @returns {string}
 */
export function tmpDir(t) {
    const dir = mkdtempSync(join(tmpdir(), 'c2m-ava-'));
    t.teardown(() => {
        rmSync(dir, { recursive: true, force: true });
    });
    return dir;
}

/**
 * Write a file, creating parent directories, and return its absolute path.
 * @param {string} dir
 * @param {string} relativePath
 * @param {string} content
 * @returns {string}
 */
export function writeFile(dir, relativePath, content) {
    const target = join(dir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
    return target;
}

/**
 * @param {string} dir
 * @param {string} relativePath
 * @returns {string}
 */
export function readFile(dir, relativePath) {
    return readFileSync(join(dir, relativePath), 'utf8');
}

/**
 * Run a Node script and resolve with its exit code and output.
 * Never rejects: a non-zero exit code is data, not an exception.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function runNode(args, cwd) {
    return new Promise(resolve => {
        execFile(process.execPath, args, { cwd, encoding: 'utf8' }, (error, stdout, stderr) => {
            resolve({
                code: error === null ? 0 : typeof error.code === 'number' ? error.code : -1,
                stdout,
                stderr,
            });
        });
    });
}

/**
 * Run one of the two CLIs.
 * @param {'cov2md' | 'covgaps'} which
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function runCli(which, args, cwd) {
    return runNode([which === 'cov2md' ? CLI_COV2MD : CLI_COVGAPS, ...args], cwd);
}

/**
 * Build an istanbul source location that fits on one line.
 * @param {number} line
 * @param {number} startColumn
 * @param {number} endColumn
 * @returns {{ start: { line: number, column: number }, end: { line: number, column: number } }}
 */
export function loc(line, startColumn, endColumn) {
    return {
        start: { line, column: startColumn },
        end: { line, column: endColumn },
    };
}

/**
 * Quote a path for a regenerated fixture, so a Windows backslash path still
 * round-trips through JSON.
 * @param {string} path
 * @returns {string}
 */
export function jsonPath(path) {
    return path.replace(/\\/g, '\\\\');
}
