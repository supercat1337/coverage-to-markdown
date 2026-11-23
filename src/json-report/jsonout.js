// @ts-check

/**
 * Optional machine-readable export, written only when `--json <path>` is
 * given.
 *
 * Separate from the Markdown on purpose: mixing the two made the document
 * twice as long and left the same facts with two authoritative-looking copies
 * inside one artifact. Programs read this file; people read `cov.md`.
 *
 * The model does not repeat itself. An uncovered arm is simply one with
 * `hits === 0`, so there is no second `missingArms` field to disagree with
 * the first.
 */

import { writeFileSync } from 'node:fs';

/** @typedef {import('./types.js').FileReport} FileReport */
/** @typedef {import('./types.js').LabeledGap} LabeledGap */
/** @typedef {import('./types.js').Provenance} Provenance */
/** @typedef {import('./types.js').Totals} Totals */

/** Bumped when the shape below changes incompatibly. */
export const SCHEMA_VERSION = 1;

/**
 * Build the JSON model.
 * @param {object} input
 * @param {string} input.report Path of the coverage report, for provenance.
 * @param {string} input.scope Human-readable scope description.
 * @param {Provenance} input.provenance
 * @param {Totals} input.totals
 * @param {FileReport[]} input.files
 * @param {LabeledGap[]} input.labeled Labels assigned once, shared with the Markdown.
 * @returns {object} Plain JSON-serialisable object.
 */
export function buildModel({ report, scope, provenance, totals, files, labeled }) {
    return {
        schema: SCHEMA_VERSION,
        report,
        scope,
        revision: provenance.revision,
        dirty: provenance.dirty,
        generated: provenance.generated,
        numbering: { lines: '1-based', columns: '0-based', arms: '1-based' },
        totals,
        files: files.map(file => ({
            file: file.displayPath,
            sha256: file.sha256,
            statements: file.totals.statements,
            branches: file.totals.branches,
            functions: file.totals.functions,
            uncalledFunctions: file.uncoveredFunctions,
            gaps: labeled
                .filter(item => item.file === file)
                .map(item =>
                    item.gap.kind === 'block'
                        ? {
                              label: item.label,
                              kind: 'block',
                              startLine: item.gap.start,
                              endLine: item.gap.end,
                              statements: item.gap.statements,
                          }
                        : {
                              label: item.label,
                              kind: 'branch',
                              type: item.gap.type,
                              line: item.gap.line,
                              column: item.gap.column,
                              arms: item.gap.arms.map(arm => ({
                                  arm: arm.arm,
                                  line: arm.line,
                                  column: arm.column,
                                  endLine: arm.endLine,
                                  endColumn: arm.endColumn,
                                  hits: arm.hits,
                              })),
                          }
                ),
        })),
    };
}

/**
 * Write the model as JSON. Two-space indent keeps the file readable when a
 * diff of it shows up in review.
 * @param {object} model
 * @param {string} outputPath
 * @returns {void}
 */
export function writeModel(model, outputPath) {
    writeFileSync(outputPath, JSON.stringify(model, null, 2) + '\n', 'utf8');
}
