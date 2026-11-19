/**
 * Inclusive line range in a source file (1-based).
 */
export interface Range {
    /** First line of the range. */
    start: number;
    /** Last line of the range. */
    end: number;
}

/**
 * How uncovered lines are marked inside rendered snippets.
 *
 * - `none` — no marker, just line-number comments (pre-2.1 snippet format).
 * - `comment` — append `← UNCOVERED` to the line-number comment on
 *   uncovered lines; keeps lines copy-pasteable.
 * - `gutter` — put the line number on the left with a `│` separator and
 *   use `>` for uncovered lines; reads like a diff.
 */
export type HighlightMode = 'none' | 'comment' | 'gutter';

/**
 * Options for `buildMarkdown`.
 */
export interface BuildOptions {
    /** Lines of context before and after each range. Default: 2. */
    contextLines?: number;
    /** Custom top-level heading text. Default: `Coverage: <basename>`. */
    title?: string;
    /** Fence language override. Default: detected from the file extension. */
    fence?: string;
    /** How uncovered lines are marked. Default: `comment`. */
    highlight?: HighlightMode;
    /**
     * Command that reproduces the coverage report. When set, a
     * `Reproduce:` line is added to the header. Backticks and newlines
     * are sanitised to keep the Markdown valid.
     */
    command?: string;
}
