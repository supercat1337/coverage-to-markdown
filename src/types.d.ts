/**
 * Inclusive line range in a source file (1-based).
 */
export interface Range {
    /** First line of the range. */
    start: number;
    /** Last line of the range. */
    end: number;
}
