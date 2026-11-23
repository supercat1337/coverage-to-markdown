// @ts-check

/**
 * Fence language detection and safe fence length.
 *
 * The length matters because source code may itself contain backtick runs —
 * Markdown fixtures, shell scripts that print fences, JSDoc examples. A fence
 * that is one backtick longer than the longest run inside the block cannot be
 * closed early.
 */

import { extname } from 'node:path';

export const MIN_FENCE_LENGTH = 3;

/**
 * File extension to markdown fence language identifier.
 * @type {Record<string, string>}
 */
export const EXTENSION_TO_FENCE = {
    '.js': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.jsx': 'jsx',
    '.ts': 'ts',
    '.mts': 'ts',
    '.cts': 'ts',
    '.tsx': 'tsx',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.swift': 'swift',
    '.c': 'c',
    '.h': 'c',
    '.cc': 'cpp',
    '.cpp': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.md': 'markdown',
    '.xml': 'xml',
    '.lua': 'lua',
    '.dart': 'dart',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.erl': 'erlang',
    '.hs': 'haskell',
    '.clj': 'clojure',
    '.vue': 'vue',
    '.svelte': 'svelte',
};

/**
 * Map a file extension to a Markdown fence language identifier.
 * @param {string} filePath
 * @returns {string} Language identifier, or an empty string when unknown.
 */
export function detectFenceLanguage(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const ext = extname(normalized).toLowerCase();
    return EXTENSION_TO_FENCE[ext] ?? '';
}

/**
 * One backtick more than the longest backtick run inside the snippet, and
 * never fewer than three.
 * @param {string[]} lines
 * @param {number} start 1-based first line of the snippet.
 * @param {number} end 1-based last line of the snippet.
 * @returns {number}
 */
export function pickFenceLength(lines, start, end) {
    let maxRun = 0;
    const from = Math.max(0, start - 1);
    const to = Math.min(end, lines.length);

    for (let i = from; i < to; i += 1) {
        // Indices are clamped by Math.min(end, lines.length) above.
        /* c8 ignore next */
        const runs = (lines[i] ?? '').match(/`+/g);
        if (!runs) {
            continue;
        }
        for (const run of runs) {
            if (run.length > maxRun) {
                maxRun = run.length;
            }
        }
    }

    return Math.max(MIN_FENCE_LENGTH, maxRun + 1);
}
