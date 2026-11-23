export { analyzeFile, collectFunctionSpans, mergeLineRanges, readReport } from './istanbul.js';
export { armDescriptors, isPhantomLine } from './branches.js';
export { loadSource, matchOperator, sliceSource } from './source.js';
export { assignLabels, buildFileReport, selectFiles, sortFiles, sumTotals } from './files.js';
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
export { renderGapLine, renderRegion } from './render.js';
export { buildReport } from './report.js';
export { readProvenance } from './provenance.js';
export { checkFreshness } from './freshness.js';
export { code, metricLine, percent, percentText, toDisplayPath } from './format.js';
export { buildModel, SCHEMA_VERSION, writeModel } from './jsonout.js';

export type {
    Analysis,
    ArmDescriptor,
    BlockGap,
    BranchArm,
    BranchEntry,
    BranchGap,
    CoverageEntry,
    CoverageReport,
    FileReport,
    Freshness,
    FunctionEntry,
    FunctionSpan,
    Gap,
    HighlightMode,
    LabeledGap,
    LineRange,
    Metric,
    Position,
    Provenance,
    Region,
    ReportOptions,
    SnippetWindow,
    SortMode,
    SourceLocation,
    StatementEntry,
    Totals,
    UncoveredFunction,
} from './types.js';