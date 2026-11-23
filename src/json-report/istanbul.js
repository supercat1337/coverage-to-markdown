// @ts-check

/**
 * Reading the istanbul/c8 JSON report and turning one file's entry into
 * totals, gaps, per-line reasons and function spans.
 *
 * The three maps use three different record shapes; typing them as one
 * shared "MapEntry" is wrong. `statementMap` entries are locations
 * themselves, while `fnMap` and `branchMap` entries wrap them.
 */

import { readFileSync } from 'node:fs';

/** @typedef {import('./types.js').CoverageReport} CoverageReport */
/** @typedef {import('./types.js').CoverageEntry} CoverageEntry */
/** @typedef {import('./types.js').StatementEntry} StatementEntry */
/** @typedef {import('./types.js').FunctionEntry} FunctionEntry */
/** @typedef {import('./types.js').BranchEntry} BranchEntry */
/** @typedef {import('./types.js').SourceLocation} SourceLocation */
/** @typedef {import('./types.js').FunctionSpan} FunctionSpan */
/** @typedef {import('./types.js').BranchArm} BranchArm */
/** @typedef {import('./types.js').BlockGap} BlockGap */
/** @typedef {import('./types.js').BranchGap} BranchGap */
/** @typedef {import('./types.js').Gap} Gap */
/** @typedef {import('./types.js').Analysis} Analysis */
/** @typedef {import('./types.js').UncoveredFunction} UncoveredFunction */
/** @typedef {import('./types.js').LineRange} LineRange */

/**
 * Read and parse a coverage report.
 * @param {string} reportPath
 * @returns {CoverageReport}
 */
export function readReport(reportPath) {
    /** @type {string} */
    let raw;
    try {
        raw = readFileSync(reportPath, 'utf8');
    } catch {
        throw new Error('Cannot read coverage report: ' + reportPath);
    }

    /** @type {unknown} */
    let json;
    try {
        json = JSON.parse(raw);
    } catch (error) {
        /* c8 ignore next -- JSON.parse throws SyntaxError, which is an Error */
        const message = error instanceof Error ? error.message : String(error);
        throw new Error('Coverage report is not valid JSON: ' + reportPath + ' (' + message + ')');
    }

    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error(
            'Coverage report must be an object mapping file paths to coverage data: ' + reportPath
        );
    }

    return /** @type {CoverageReport} */ (json);
}

/**
 * Sort ranges and merge overlapping or directly adjacent ones.
 * @param {LineRange[]} ranges
 * @returns {LineRange[]} Merged ranges, sorted by start.
 */
export function mergeLineRanges(ranges) {
    const sorted = ranges.slice().sort((a, b) => a.start - b.start || a.end - b.end);
    /** @type {LineRange[]} */
    const merged = [];
    for (const range of sorted) {
        const last = merged[merged.length - 1];
        if (last && range.start <= last.end + 1) {
            if (range.end > last.end) {
                last.end = range.end;
            }
        } else {
            merged.push({ start: range.start, end: range.end });
        }
    }
    return merged;
}

/**
 * Collect function spans from `fnMap`. The span comes from `loc` because
 * `decl` covers only the declaration, with `decl` as the fallback.
 * @param {Record<string, FunctionEntry>} fnMap
 * @returns {FunctionSpan[]}
 */
export function collectFunctionSpans(fnMap) {
    /** @type {FunctionSpan[]} */
    const spans = [];

    for (const meta of Object.values(fnMap)) {
        if (!meta) {
            continue;
        }
        const body = meta.loc ?? meta.decl ?? null;
        if (!body || !body.start || !body.end) {
            continue;
        }
        const declLine = meta.decl && meta.decl.start ? meta.decl.start.line : body.start.line;
        spans.push({
            name: typeof meta.name === 'string' && meta.name.length > 0 ? meta.name : '(anonymous)',
            startLine: body.start.line,
            endLine: body.end.line,
            declLine,
        });
    }

    spans.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);
    return spans;
}

/**
 * First line of a gap, used for sorting gaps in source order.
 * @param {Gap} gap
 * @returns {number}
 */
function startOf(gap) {
    return gap.kind === 'block' ? gap.start : gap.line;
}

/**
 * Turn one coverage entry into totals, gaps, per-line reasons and spans.
 * @param {string} filePath
 * @param {CoverageEntry} entry
 * @returns {Analysis}
 */
export function analyzeFile(filePath, entry) {
    if (entry === null || typeof entry !== 'object') {
        throw new Error('Coverage entry for ' + filePath + ' is not an object.');
    }

    /** @type {Record<string, StatementEntry>} */
    const statementMap = entry.statementMap ?? {};
    /** @type {Record<string, number>} */
    const statementCounts = entry.s ?? {};
    /** @type {Record<string, FunctionEntry>} */
    const fnMap = entry.fnMap ?? {};
    /** @type {Record<string, number>} */
    const fnCounts = entry.f ?? {};
    /** @type {Record<string, BranchEntry>} */
    const branchMap = entry.branchMap ?? {};
    /** @type {Record<string, number[]>} */
    const branchCounts = entry.b ?? {};

    const functions = collectFunctionSpans(fnMap);

    // --- statements ---------------------------------------------------
    /** @type {LineRange[]} */
    const uncoveredStatements = [];
    for (const [id, loc] of Object.entries(statementMap)) {
        if (!loc || !loc.start || !loc.end) {
            continue;
        }
        if (Number(statementCounts[id] ?? 0) !== 0) {
            continue;
        }
        uncoveredStatements.push({ start: loc.start.line, end: loc.end.line });
    }

    // --- functions ----------------------------------------------------
    /** @type {UncoveredFunction[]} */
    const uncoveredFunctions = [];
    for (const [id, meta] of Object.entries(fnMap)) {
        if (!meta) {
            continue;
        }
        if (Number(fnCounts[id] ?? 0) !== 0) {
            continue;
        }
        const decl = meta.decl ?? meta.loc ?? null;
        uncoveredFunctions.push({
            name: typeof meta.name === 'string' && meta.name.length > 0 ? meta.name : '(anonymous)',
            line: decl && decl.start ? decl.start.line : null,
        });
    }

    // --- branches -----------------------------------------------------
    /** @type {BranchGap[]} */
    const branchGaps = [];
    let branchArms = 0;
    let coveredArms = 0;

    for (const [id, meta] of Object.entries(branchMap)) {
        if (!meta) {
            continue;
        }

        // `meta.locations` is `SourceLocation[] | undefined`; the guard
        // below narrows it, so `loc` and `index` inside `map` are typed
        // without any cast.
        /** @type {SourceLocation[]} */
        const locations = Array.isArray(meta.locations) ? meta.locations : [];

        /** @type {number[]} */
        const counts = Array.isArray(branchCounts[id]) ? branchCounts[id] : [];

        /** @type {BranchArm[]} */
        const arms = locations.map((loc, index) => ({
            arm: index + 1,
            line: loc && loc.start ? loc.start.line : null,
            column: loc && loc.start ? Math.max(0, loc.start.column) : null,
            endLine: loc && loc.end ? loc.end.line : null,
            endColumn: loc && loc.end ? Math.max(0, loc.end.column) : null,
            hits: Number(counts[index] ?? 0),
        }));

        branchArms += arms.length;
        for (const arm of arms) {
            if (arm.hits > 0) {
                coveredArms += 1;
            }
        }

        /** @type {number[]} */
        const missingArms = [];
        for (const arm of arms) {
            if (arm.hits === 0) {
                missingArms.push(arm.arm);
            }
        }
        if (missingArms.length === 0) {
            continue;
        }

        const first = locations[0];
        const line =
            typeof meta.line === 'number'
                ? meta.line
                : first && first.start
                  ? first.start.line
                  : null;

        if (line === null) {
            continue;
        }

        branchGaps.push({
            kind: 'branch',
            type: typeof meta.type === 'string' && meta.type.length > 0 ? meta.type : 'branch',
            line,
            // Unreachable: a falsy first.start makes `line` null, and line 235
            // continues before this expression is evaluated.
            /* c8 ignore next */
            column: first && first.start ? Math.max(0, first.start.column) : null,
            arms,
            missingArms,
        });
    }

    // --- contiguous uncovered blocks ----------------------------------
    /** @type {BlockGap[]} */
    const blocks = mergeLineRanges(uncoveredStatements).map(range => ({
        kind: 'block',
        start: range.start,
        end: range.end,
        statements: uncoveredStatements.filter(
            statement => statement.start >= range.start && statement.end <= range.end
        ).length,
    }));

    // --- gaps in source order -----------------------------------------
    /** @type {Gap[]} */
    const gaps = [...blocks, ...branchGaps];
    gaps.sort((a, b) => startOf(a) - startOf(b) || a.kind.localeCompare(b.kind));

    // --- per-line reasons ----------------------------------------------
    /** @type {Map<number, string[]>} */
    const reasons = new Map();

    /**
     * @param {number} line
     * @param {string} text
     * @returns {void}
     */
    const addReason = (line, text) => {
        const list = reasons.get(line) ?? [];
        if (!list.includes(text)) {
            list.push(text);
        }
        reasons.set(line, list);
    };

    for (const block of blocks) {
        for (let n = block.start; n <= block.end; n += 1) {
            addReason(n, 'UNCOVERED');
        }
    }
    for (const gap of branchGaps) {
        for (const arm of gap.arms) {
            if (arm.hits === 0 && arm.line !== null) {
                addReason(arm.line, 'BRANCH ' + arm.arm + '/' + gap.arms.length);
            }
        }
    }

    const statementTotal = Object.keys(statementMap).length;
    const functionTotal = Object.keys(fnMap).length;

    return {
        totals: {
            statements: {
                covered: statementTotal - uncoveredStatements.length,
                total: statementTotal,
            },
            branches: { covered: coveredArms, total: branchArms },
            functions: { covered: functionTotal - uncoveredFunctions.length, total: functionTotal },
        },
        gaps,
        reasons,
        uncoveredFunctions,
        functions,
    };
}
