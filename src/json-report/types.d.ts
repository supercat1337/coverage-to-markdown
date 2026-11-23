/**
 * Shared types for the coverage JSON report generator.
 *
 * This module emits nothing at runtime. Every other module names the same
 * shapes through `@typedef {import('./types.js').Gap} Gap`, and TypeScript
 * resolves that specifier to this file. Keeping them here means a change to
 * the report format is a change in one place, not twelve.
 */

/** Inclusive line range in a source file (1-based). */
export interface LineRange {
    start: number;
    end: number;
}

/** How uncovered lines are marked inside rendered snippets. */
export type HighlightMode = 'none' | 'comment' | 'gutter';

/** File ordering in the document. */
export type SortMode = 'alpha' | 'gaps' | 'percent';

/** Coverage counters for one metric. */
export interface Metric {
    covered: number;
    total: number;
}

/** Coverage counters for a file or for the whole report. */
export interface Totals {
    statements: Metric;
    branches: Metric;
    functions: Metric;
}

/** A position in a source file: 1-based line, 0-based column. */
export interface Position {
    /** 1-based line number. */
    line: number;
    /** 0-based column number. */
    column: number;
}

/** A span in a source file, exactly as istanbul reports it. */
export interface SourceLocation {
    start: Position;
    end: Position;
}

/** One entry of `statementMap`: the span of a single statement. */
export type StatementEntry = SourceLocation;

/** One entry of `fnMap`. */
export interface FunctionEntry {
    /** Function name; empty for anonymous functions. */
    name?: string;
    /** Span of the declaration. */
    decl?: SourceLocation;
    /** Span of the whole function. */
    loc?: SourceLocation;
}

/** One entry of `branchMap`. */
export interface BranchEntry {
    /** Span of the whole construct. */
    loc?: SourceLocation;
    /** Branch kind: `if`, `switch`, `cond-expr`, ... */
    type?: string;
    /** One span per arm. */
    locations?: SourceLocation[];
    /** Convenience line number. */
    line?: number;
}

/** One file's coverage data as written by istanbul or c8. */
export interface CoverageEntry {
    /** Span per statement. */
    statementMap?: Record<string, StatementEntry>;
    /** Hit count per statement id. */
    s?: Record<string, number>;
    /** Metadata per function. */
    fnMap?: Record<string, FunctionEntry>;
    /** Hit count per function id. */
    f?: Record<string, number>;
    /** Metadata per branch. */
    branchMap?: Record<string, BranchEntry>;
    /** Hit count per arm, per branch id. */
    b?: Record<string, number[]>;
}

/** A whole coverage report: absolute source path to that file's data. */
export type CoverageReport = Record<string, CoverageEntry>;

/** Span of one function, taken from `fnMap` so no AST is needed. */
export interface FunctionSpan {
    /** Function name, `(anonymous)` when unnamed. */
    name: string;
    /** First line of the function body. */
    startLine: number;
    /** Last line of the function body. */
    endLine: number;
    /** Line of the declaration. */
    declLine: number;
}

/** One arm (alternative) of a branch. */
export interface BranchArm {
    /** 1-based arm index inside its branch. */
    arm: number;
    /** 1-based line of the arm. */
    line: number | null;
    /** 0-based column of the arm. */
    column: number | null;
    /** 1-based end line of the arm. */
    endLine: number | null;
    /** 0-based end column of the arm. */
    endColumn: number | null;
    /** How many times this arm executed. */
    hits: number;
}

/** How an arm should be described in prose. */
export interface ArmDescriptor {
    /** For example `right operand of ??`. */
    role: string;
    /** First line of the arm, truncated. */
    operand: string | null;
}

/** A contiguous block of statements that never executed. */
export interface BlockGap {
    kind: 'block';
    /** First line of the block. */
    start: number;
    /** Last line of the block. */
    end: number;
    /** Number of uncovered statements inside the block. */
    statements: number;
}

/** A branch that has at least one arm with zero hits. */
export interface BranchGap {
    kind: 'branch';
    /** Branch kind as reported by istanbul. */
    type: string;
    /** 1-based line where the branch sits. */
    line: number;
    /** 0-based column where the branch sits. */
    column: number | null;
    /** All arms of the branch. */
    arms: BranchArm[];
    /** 1-based indexes of arms with zero hits. */
    missingArms: number[];
}

export type Gap = BlockGap | BranchGap;

/** A function that was never called. */
export interface UncoveredFunction {
    name: string;
    line: number | null;
}

/** Raw result of analysing one coverage entry. */
export interface Analysis {
    totals: Totals;
    gaps: Gap[];
    /** Per-line notes such as `UNCOVERED`. */
    reasons: Map<number, string[]>;
    uncoveredFunctions: UncoveredFunction[];
    /** Spans used to cut snippets. */
    functions: FunctionSpan[];
}

/** One analysed file, ready for rendering. */
export interface FileReport {
    /** Path as it appears in the report. */
    path: string;
    /** Path as printed in the document. */
    displayPath: string;
    /** Source text, null when unreadable. */
    sourceLines: string[] | null;
    /** First 12 hex digits of the content hash. */
    sha256: string | null;
    /**
     * Modification time used to age the report, `null` when the source could
     * not be read.
     */
    mtimeMs: number | null;
    /** Lines already shown as uncovered blocks. */
    blockLines: Set<number>;
    totals: Totals;
    gaps: Gap[];
    reasons: Map<number, string[]>;
    uncoveredFunctions: UncoveredFunction[];
    functions: FunctionSpan[];
}

export interface LabeledGap {
    label: string;
    file: FileReport;
    gap: Gap;
}

/** Where the coverage run came from. */
export interface Provenance {
    /** Short git revision, null when unavailable. */
    revision: string | null;
    /** Paths reported dirty by git, empty when clean. */
    dirty: string[];
    /** ISO timestamp, null when suppressed. */
    generated: string | null;
}

/**
 * Result of the ageing check: did any source change after the coverage run?
 *
 * The SHA-256 column cannot answer this — it is computed from the file that is
 * printed, in the same pass, so it always matches by construction. Comparing
 * modification times is the only signal available without re-running the tests.
 */
export interface Freshness {
    /** ISO timestamp of the report file, `null` when it could not be stat-ed. */
    reportTime: string | null;
    /** Display paths modified after the report. */
    stale: string[];
    /** How many sources could be stat-ed. */
    checked: number;
}

/**
 * Window of source lines chosen for one snippet.
 *
 * `to` may be smaller than `from`: an empty or unreadable source yields the
 * sentinel `{ from: 1, to: 0 }`, which renders nothing. Callers that iterate
 * the window must compare the two instead of assuming `from <= to`.
 */
export interface SnippetWindow {
    /** First rendered line. */
    from: number;
    /** Last rendered line, possibly below `from`. */
    to: number;
    /** Lines cut above the window. */
    before: LineRange | null;
    /** Lines cut below the window. */
    after: LineRange | null;
    /** Enclosing function, when one was used. */
    fn: FunctionSpan | null;
}

/** Options for `buildReport`. */
export interface ReportOptions {
    title: string;
    reportDisplay: string;
    scopeText: string;
    files: FileReport[];
    /** Labels already assigned by `assignLabels`. */
    labeled: LabeledGap[];
    totals: Totals;
    contextLines: number;
    maxLines: number;
    highlight: HighlightMode;
    provenance: Provenance;
    /**
     * Ageing check result. Omitted means "not checked": `buildReport` then
     * prints no warning, which is the documented default.
     */
    freshness?: Freshness;
}

export interface Region {
    file: FileReport;
    /** Window already chosen by `snippetWindow`. */
    win: SnippetWindow;
    /** Gaps inside `win`, in source order. */
    gaps: LabeledGap[];
    /**
     * Ranges inside `win` that hold no gap and are too long to print. Empty
     * for a single-gap region.
     */
    holes: LineRange[];
}
