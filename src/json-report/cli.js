#!/usr/bin/env node

// @ts-check

/**
 * Entry point. Parses flags, validates paths before touching anything,
 * orchestrates the modules, writes the document and the optional JSON export.
 *
 * Failures print a single message to stderr and exit with code 1 — no stack
 * traces — matching the behaviour of the sibling `cov2md` CLI.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isMainModule } from '../is-main.js';

import {
    CLI_OPTIONS,
    DEFAULT_CONTEXT,
    DEFAULT_MAX_LINES,
    DEFAULT_OUTPUT,
    DEFAULT_REPORT,
    HELP_TEXT,
    parseContextOption,
    parseHighlightOption,
    parseMaxLinesOption,
    parseSortOption,
} from './args.js';
import { assignLabels, buildFileReport, selectFiles, sortFiles, sumTotals } from './files.js';
import { checkFreshness } from './freshness.js';
import { code, toDisplayPath } from './format.js';
import { readReport } from './istanbul.js';
import { buildModel, writeModel } from './jsonout.js';
import { readProvenance } from './provenance.js';
import { buildReport } from './report.js';

/**
 * Validate the report path before any output file is created.
 * @param {string} reportPath
 * @returns {void}
 */
function guardReport(reportPath) {
    if (!existsSync(reportPath)) {
        throw new Error(
            'Coverage report not found: ' +
                reportPath +
                '. Generate it first, for example: npx c8 --all --reporter=json ava'
        );
    }
    if (!statSync(reportPath).isFile()) {
        throw new Error('Coverage report is not a regular file: ' + reportPath);
    }
}

/**
 * @param {string} outputPath
 * @param {string} reportPath
 * @param {boolean} force
 * @returns {void}
 */
function guardOutput(outputPath, reportPath, force) {
    if (outputPath === reportPath) {
        throw new Error('--output must differ from the coverage report path.');
    }
    if (existsSync(outputPath) && !force) {
        throw new Error(
            'Output file already exists: ' + outputPath + '. Pass --force to overwrite it.'
        );
    }
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
        throw new Error(
            'Output directory does not exist: ' +
                outputDir +
                '. Create it first, or choose a different --output path.'
        );
    }
}

/**
 * @param {string} jsonPath
 * @param {string} outputPath
 * @param {string} reportPath
 * @param {boolean} force
 * @returns {void}
 */
function guardJsonPath(jsonPath, outputPath, reportPath, force) {
    if (jsonPath === outputPath || jsonPath === reportPath) {
        throw new Error('--json must point at a path different from --output and the report.');
    }
    if (existsSync(jsonPath) && !force) {
        throw new Error(
            'JSON file already exists: ' +
                jsonPath +
                '. Pass --force to overwrite it. A coverage run is expensive to repeat; ' +
                'silently replacing its data export is worse than failing here.'
        );
    }
    const jsonDir = dirname(jsonPath);
    if (!existsSync(jsonDir)) {
        throw new Error(
            '--json directory does not exist: ' +
                jsonDir +
                '. Create it first, or choose a different path.'
        );
    }
}

/**
 * @returns {string} Package version.
 */
function readVersion() {
    const pkgUrl = new URL('../../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8'));
    return pkg.version;
}

/**
 * @param {string[]} argv
 * @returns {void}
 */
function main(argv) {
    try {
        const { values, positionals } = parseArgs({
            args: argv,
            allowPositionals: true,
            options: CLI_OPTIONS,
        });

        if (values.help) {
            process.stdout.write(HELP_TEXT);
            return;
        }
        if (values.version) {
            process.stdout.write(readVersion() + '\n');
            return;
        }

        if (positionals.length > 1) {
            throw new Error(
                'Expected at most one positional argument (the coverage JSON report), got ' +
                    positionals.length +
                    '.'
            );
        }
        if (positionals.length === 1 && values.input !== undefined) {
            throw new Error('Pass either a positional report path or --input, not both.');
        }

        const reportPath = resolve(values.input ?? positionals[0] ?? DEFAULT_REPORT);
        guardReport(reportPath);

        const outputPath = resolve(values.output ?? DEFAULT_OUTPUT);
        guardOutput(outputPath, reportPath, values.force === true);

        const jsonPath = values.json !== undefined ? resolve(values.json) : null;
        if (jsonPath !== null) {
            guardJsonPath(jsonPath, outputPath, reportPath, values.force === true);
        }

        const contextLines =
            values.context !== undefined ? parseContextOption(values.context) : DEFAULT_CONTEXT;

        const maxLines =
            values['max-lines'] !== undefined
                ? parseMaxLinesOption(values['max-lines'])
                : DEFAULT_MAX_LINES;

        const highlight =
            values.highlight !== undefined ? parseHighlightOption(values.highlight) : 'comment';

        const sortMode = parseSortOption(values.sort ?? 'alpha');

        const report = readReport(reportPath);
        const selected = selectFiles(report, values.source);

        const built = selected.map(filePath =>
            buildFileReport(filePath, report[filePath], values['absolute-path'] === true)
        );
        const files = sortFiles(built, sortMode);
        const totals = sumTotals(files);

        // Assigned once and shared, so the Markdown and the JSON export can
        // never disagree about which gap is G7.
        const labeled = assignLabels(files);

        const provenance = readProvenance(
            values.git !== false && values['no-git'] !== true,
            values.timestamp !== false && values['no-timestamp'] !== true
        );

        const scopeText =
            values.source !== undefined
                ? code(files[0] ? files[0].displayPath : values.source) + ' · 1 file'
                : 'all files · ' + files.length + (files.length === 1 ? ' file' : ' files');

        const reportDisplay =
            values['absolute-path'] === true ? reportPath : toDisplayPath(reportPath);

        const freshness = checkFreshness(reportPath, files);

        const markdown = buildReport({
            title: values.title ?? 'Coverage gaps',
            reportDisplay,
            scopeText,
            files,
            labeled,
            totals,
            contextLines,
            maxLines,
            highlight,
            provenance,
            freshness,
        });

        writeFileSync(outputPath, markdown, 'utf8');
        const written = statSync(outputPath);

        if (jsonPath !== null) {
            writeModel(
                buildModel({
                    report: reportDisplay,
                    scope: scopeText,
                    provenance,
                    totals,
                    files,
                    labeled,
                }),
                jsonPath
            );
        }

        if (!values.quiet) {
            let blockCount = 0;
            let branchCount = 0;
            for (const file of files) {
                for (const gap of file.gaps) {
                    if (gap.kind === 'block') {
                        blockCount += 1;
                    } else {
                        branchCount += 1;
                    }
                }
            }

            /** @type {string[]} */
            const summary = [
                'coverage-json-to-markdown: wrote report',
                '  report: ' + reportPath,
                '  scope:  ' + files.length + ' of ' + Object.keys(report).length + ' file(s)',
                '  output: ' + outputPath,
            ];
            if (jsonPath !== null) {
                summary.push('  json:   ' + jsonPath);
            }
            summary.push(
                '  gaps:   ' +
                    (blockCount + branchCount) +
                    ' (' +
                    blockCount +
                    ' block(s), ' +
                    branchCount +
                    ' branch(es))',
                '  size:   ' + written.size + ' bytes'
            );
            process.stdout.write(summary.join('\n') + '\n');
        }
    } catch (error) {
        /* c8 ignore next -- main() throws Error only */
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write('coverage-json-to-markdown: error: ' + message + '\n');
        process.exit(1);
    }
}

if (isMainModule(import.meta.url)) {
    main(process.argv.slice(2));
}
