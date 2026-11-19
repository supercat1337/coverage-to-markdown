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
 * Options for `buildMarkdown`.
 */
export interface BuildOptions {
    /** Lines of context before and after each range. Default: 2. */
    contextLines?: number;
    /** Custom top-level heading text. Default: `Coverage: <basename>`. */
    title?: string;
    /** Fence language override. Default: detected from the file extension. */
    fence?: string;
}
