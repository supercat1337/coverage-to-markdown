#!/usr/bin/env node
// @ts-check

import { isMainModule } from './is-main.js';
import { runCli } from './cov2md/cli.js';

export { detectFenceLanguage } from './cov2md/fences.js';
export { buildMarkdown } from './cov2md/markdown.js';
export { normalizeRanges, parseRanges } from './cov2md/ranges.js';

if (isMainModule(import.meta.url)) {
    runCli(process.argv.slice(2));
}
