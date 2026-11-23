// @ts-check

/**
 * Public API of the JSON report generator, for tests and for programmatic
 * use. Kept in `src/`, so it ships with the package.
 *
 * Every name listed in the README has to be exported here: this module is the
 * documented entry point, and a missing export turns a documented example into
 * a `SyntaxError` at import time instead of a broken call.
 */

// --- reading and analysing ---------------------------------------------
export { analyzeFile, collectFunctionSpans, mergeLineRanges, readReport } from './istanbul.js';
export { armDescriptors, isPhantomLine } from './branches.js';
export { loadSource, matchOperator, sliceSource } from './source.js';

// --- selecting, ordering, labelling ------------------------------------
export { assignLabels, buildFileReport, selectFiles, sortFiles, sumTotals } from './files.js';

// --- snippets and regions ----------------------------------------------
export {
    enclosingFunction,
    expandThroughJsdoc,
    fenceLength,
    renderSnippet,
    renderWindowBlock,
    snippetBlock,
    snippetWindow,
} from './snippet.js';
export { gapSpan, groupRegions, labelRange, regionHash } from './regions.js';

// --- rendering ---------------------------------------------------------
export { renderGapLine, renderRegion } from './render.js';
export { buildReport } from './report.js';

// --- provenance and formatting -----------------------------------------
export { readProvenance } from './provenance.js';
export { code, metricLine, percent, percentText, toDisplayPath } from './format.js';
export { checkFreshness } from './freshness.js';

// --- machine-readable export -------------------------------------------
export { buildModel, SCHEMA_VERSION, writeModel } from './jsonout.js';
