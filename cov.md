# Coverage gaps

Report: `coverage/coverage-final.json`

Scope: all files · 25 files

Revision: `f4b6b5b`
Dirty: 10 file(s) — `src/json-report/format.js`, `src/json-report/istanbul.js`, `src/json-report/provenance.js`, `src/json-report/render.js`, `src/json-report/report.js`, `src/json-report/source.js`, `tests/cli/covgaps.test.js`, `tests/jsonout.test.js`, `tests/provenance.test.js`, `tests/render.test.js`

Generated: `2026-11-24T12:11:35.261Z`

| Metric | Covered | Total | Percent |
| --- | ---: | ---: | ---: |
| Statements | 3913 | 3948 | 99.1 % |
| Branches | 848 | 867 | 97.8 % |
| Functions | 107 | 108 | 99.1 % |

## Files in scope

| File | SHA-256 (12) | Stmts | Branch | Funcs | Gaps |
| --- | --- | ---: | ---: | ---: | ---: |
| `src/cov2md/args.js` | `a938cedae36c` | 153/153 | 19/19 | 4/4 | 0 |
| `src/cov2md/cli.js` | `8c77015888cf` | 128/128 | 22/22 | 3/3 | 0 |
| `src/cov2md/fences.js` | `25dad1575ee2` | 110/110 | 8/8 | 2/2 | 0 |
| `src/cov2md/highlight.js` | `14493ec0412b` | 96/96 | 22/22 | 4/4 | 0 |
| `src/cov2md/index.js` | `154491df95d2` | 9/9 | 1/1 | 0/0 | 0 |
| `src/cov2md/markdown.js` | `0a29aa491e0a` | 147/147 | 28/28 | 7/7 | 0 |
| `src/cov2md/paths.js` | `e169b7bf4ee2` | 101/101 | 24/24 | 5/5 | 0 |
| `src/cov2md/ranges.js` | `93e231557b3e` | 85/85 | 26/26 | 4/4 | 0 |
| `src/coverage-to-markdown.js` | `0ec7f23c75c1` | 13/13 | 1/1 | 0/0 | 0 |
| `src/is-main.js` | `4d62ce854844` | 41/41 | 5/5 | 1/1 | 0 |
| `src/json-report/args.js` | `d1c10b25a41c` | 149/149 | 14/14 | 4/4 | 0 |
| `src/json-report/branches.js` | `00e6425829b9` | 144/144 | 57/57 | 2/2 | 0 |
| `src/json-report/cli.js` | `db3e270e11cd` | 279/279 | 67/67 | 5/5 | 0 |
| `src/json-report/files.js` | `acf102f863c0` | 200/200 | 61/61 | 6/6 | 0 |
| `src/json-report/format.js` | `e464284d3ff1` | 139/139 | 28/28 | 10/10 | 0 |
| `src/json-report/freshness.js` | `f0b7279f055d` | 66/66 | 9/9 | 1/1 | 0 |
| `src/json-report/index.js` | `b3f60c5db445` | 42/42 | 1/1 | 0/0 | 0 |
| `src/json-report/istanbul.js` | `446487ca0184` | 341/353 | 126/126 | 6/7 | 2 |
| `src/json-report/jsonout.js` | `8c244346b8ac` | 94/94 | 9/9 | 2/2 | 0 |
| `src/json-report/provenance.js` | `03f91b944d20` | 85/85 | 12/12 | 3/3 | 0 |
| `src/json-report/regions.js` | `e85c45288570` | 231/236 | 51/55 | 8/8 | 4 |
| `src/json-report/render.js` | `80951ec23ef3` | 272/274 | 61/64 | 9/9 | 4 |
| `src/json-report/report.js` | `4b530c597f3f` | 429/431 | 65/67 | 5/5 | 3 |
| `src/json-report/snippet.js` | `dae8c9ea416d` | 348/348 | 78/78 | 9/9 | 0 |
| `src/json-report/source.js` | `3b71c091131e` | 211/225 | 53/63 | 7/7 | 15 |

A file whose hash matches the source you have is the one this report describes. A `0/0` row means the file has no executable statements.

Gaps: 28 (9 line blocks, 18 branches, 1 never-called function)

## How to read this file

- Gap labels `G1`, `G2`, ... are assigned per run and shift when lines change; do not treat them as stable identifiers.
- `// 176 ← UNCOVERED` — the line never executed.
- `// 12 ← BRANCH 1/1` — the line holds a branch with at least one arm that never executed.
- Gap bullets read `line 343`; the 0-based column is added as `col 22` only where two gaps share a line and it is the only thing telling them apart.
- A block bullet may end with `says `…`` — the first string literal inside the uncovered lines. It is usually the error message, which is both the meaning and the best key to grep for in the tests.
- `· in `catch`` and `· in `finally`` mark a gap inside those clauses. They are the two cases that split into "a negative test is missing" and "unreachable by contract": decide which before writing code.
- A heading that says `no enclosing function` marks a gap outside every span in `fnMap`: an arrow in a class field, module-level code, or a location v8 reported on a line that belongs to no function. These are the gaps that need a decision rather than a test.
- `Never called:` names functions whose call counter is zero. A function the document prints already is cited by its gap labels; one marked `nothing to print` has no uncovered statement or branch in its body, so there is no snippet to expect.
- Gaps that share one snippet are listed under a single heading, so `G13–G16` means four gaps inside the same window; the code is printed once, under the list.
- Snippets are cut to the enclosing function taken from `fnMap`, expanded upwards through its JSDoc block, and capped at 80 lines; anything cut is reported as "Lines a–b omitted", and the heading then says `(excerpt)`.
- Branch arms are numbered from 1. When the source is readable the operator between arms is recovered from the text, so an arm reads as `right operand of ??` rather than `arm 2 of 2`; when not one arm ran, the bullet says `no arm ever executed` instead of listing them.
- This document is deliberately human-oriented. Pass `--json <path>` to write the same gaps as a separate JSON file.

## `src/json-report/istanbul.js`

Statements 341/353 (96.6 %) · Branches 126/126 (100 %) · Functions 6/7 (85.7 %)

Never called: `countStatementsWithin` (line 132) — see G1

### G1 · in `countStatementsWithin` · lines 115–143

- **G1** lines 132–143 · block · 12 statements never executed

```js
/** // 115
 * How many statements a function body contains, covered or not. // 116
 * // 117
 * Only used for `UncoveredFunction`: the function counter and the statement // 118
 * counter are independent, so a no-op callback has `f === 0` and contributes // 119
 * no gap. The document needs to distinguish that from "the snippet is three // 120
 * sections further down", and the only honest source for the difference is // 121
 * the statement map. // 122
 * // 123
 * Entries without a full location are skipped for the same reason the // 124
 * `uncoveredStatements` loop skips them: a hand-trimmed report can hold one, // 125
 * and counting it would need a line that does not exist. // 126
 * @param {Record<string, StatementEntry>} statementMap // 127
 * @param {number} startLine // 128
 * @param {number} endLine // 129
 * @returns {number} // 130
 */ // 131
function countStatementsWithin(statementMap, startLine, endLine) { // 132 ← UNCOVERED
    let count = 0; // 133 ← UNCOVERED
    for (const loc of Object.values(statementMap)) { // 134 ← UNCOVERED
        if (!loc || !loc.start || !loc.end) { // 135 ← UNCOVERED
            continue; // 136 ← UNCOVERED
        } // 137 ← UNCOVERED
        if (loc.start.line >= startLine && loc.end.line <= endLine) { // 138 ← UNCOVERED
            count += 1; // 139 ← UNCOVERED
        } // 140 ← UNCOVERED
    } // 141 ← UNCOVERED
    return count; // 142 ← UNCOVERED
} // 143 ← UNCOVERED
```

## `src/json-report/regions.js`

Statements 231/236 (97.9 %) · Branches 51/55 (92.7 %) · Functions 8/8 (100 %)

### G2–G5 · in `regionHash` · lines 209–236

- **G2** lines 226–230 · block · 5 statements never executed
- **G3** line 231 · `branch` · (`: Math.max(region.win.from, fn.startLine)`) never executed
- **G4** line 232, col 27 · `branch` · (`? region.win.to`) never executed
- **G5** line 232, col 43 · `branch` · (`: Math.min(region.win.to, fn.endLine)`) never executed

```js
/** // 209
 * Hash of the code a region reports on, used to spot one function copied into // 210
 * two files: there the snippets are identical but the regions are not, so // 211
 * grouping cannot see it. // 212
 * // 213
 * Only the function body is hashed, never the whole window: two copies of one // 214
 * helper almost always differ in their JSDoc, and the comment belongs to the // 215
 * excerpt, not to the logic. `null` when nothing is rendered, so source-less // 216
 * regions never match each other. // 217
 * @param {Region} region // 218
 * @returns {string | null} // 219
 */ // 220
export function regionHash(region) { // 221
    const lines = region.file.sourceLines; // 222
    if (lines === null || region.win.from > region.win.to) { // 223
        return null; // 224
    } // 225
 // 226 ← UNCOVERED · BRANCH 1/1
    const fn = region.win.fn; // 227 ← UNCOVERED
    // A window can start above its function (the JSDoc climb) and end before // 228 ← UNCOVERED
    // its last line (the cap), so the two are intersected. The result is never // 229 ← UNCOVERED
    // empty: the gap itself lies inside both, which is why no guard is needed. // 230 ← UNCOVERED
    const from = fn === null ? region.win.from : Math.max(region.win.from, fn.startLine); // 231 ← BRANCH 1/1
    const to = fn === null ? region.win.to : Math.min(region.win.to, fn.endLine); // 232 ← BRANCH 1/1
 // 233
    const body = lines.slice(from - 1, to).join('\n'); // 234
    return createHash('sha256').update(body, 'utf8').digest('hex'); // 235
} // 236
```

## `src/json-report/render.js`

Statements 272/274 (99.3 %) · Branches 61/64 (95.3 %) · Functions 9/9 (100 %)

### G6 · in `clauseNote` · lines 60–79

- **G6** line 78 · `branch` · (`: ' · in ' + code(clause)`) never executed

```js
/** // 60
 * ` · in `catch`` when the gap sits inside a `catch` or `finally`, empty // 61
 * otherwise. // 62
 * // 63
 * These two clauses are the single most useful classification in the document: // 64
 * they make up about four gaps in ten in real code, and they split cleanly into // 65
 * "a negative test is missing" and "unreachable by contract, mark it skipped" — // 66
 * two different actions that look identical without this note. // 67
 * @param {LabeledGap} item // 68
 * @param {number} line 1-based line inside the block. // 69
 * @returns {string} // 70
 */ // 71
function clauseNote(item, line) { // 72
    const sourceLines = item.file.sourceLines; // 73
    if (sourceLines === null) { // 74
        return ''; // 75
    } // 76
    const clause = enclosingClause(sourceLines, line); // 77
    return clause === null ? '' : ' · in ' + code(clause); // 78 ← BRANCH 1/1
} // 79
```

### G7 · in `renderGapLine` · lines 107–180

- **G7** line 151 · `branch` · (`? locationLabel(gap)`) never executed

```js
/** // 107
 * One bullet per gap. Nested bullets appear only when a branch has several // 108
 * missing arms out of more than one; the single-arm case, which is the vast // 109
 * majority, stays one line. // 110
 * // 111
 * The order of the three cases is load-bearing. `missing.length === 1` comes // 112
 * first so a one-armed branch — `if (x)`, `catch`, a `?.` — keeps its operand // 113
 * phrase; an "every arm" check placed before it swallows that phrase and // 114
 * leaves the reader with nothing but "the branch never ran". // 115
 * @param {LabeledGap} item // 116
 * @param {Set<number>} [sharedLines] Lines that carry more than one branch gap // 117
 * in this region; the column is printed only there. // 118
 * @returns {string[]} // 119
 */ // 120
export function renderGapLine(item, sharedLines = new Set()) { // 121
    const gap = item.gap; // 122
 // 123
    if (gap.kind === 'block') { // 124
        const noun = gap.statements === 1 ? 'statement' : 'statements'; // 125
 // 126
        // An uncovered block is usually an error path, and an error path's whole // 127
        // identity is its message. `'cache.init failed'` tells the reader what // 128
        // the code does and what to grep for in `tests/`; `lines 624–626` tells // 129
        // them only where to look. // 130
        const sourceLines = item.file.sourceLines; // 131
        const literal = sourceLines === null ? null : firstLiteral(sourceLines, gap.start, gap.end); // 132
 // 133
        return [ // 134
            '- **' + // 135
                item.label + // 136
                '** ' + // 137
                linesLabel(gap.start, gap.end) + // 138
                ' · block · ' + // 139
                gap.statements + // 140
                ' ' + // 141
                noun + // 142
                ' never executed' + // 143
                (literal === null ? '' : ' · says ' + inlineCode(literal)) + // 144
                clauseNote(item, gap.start), // 145
        ]; // 146
    } // 147
 // 148
    const descriptors = armDescriptors(item.file, gap); // 149
    const missing = gap.missingArms; // 150
    const where = sharedLines.has(gap.line) ? locationLabel(gap) : 'line ' + gap.line; // 151 ← BRANCH 1/1
    const tail = clauseNote(item, gap.line); // 152
    const head = '- **' + item.label + '** ' + where + ' · ' + code(gap.type) + ' · '; // 153
 // 154
    // No "only arm" prefix: with one arm it adds nothing, and next to a // 155
    // recovered operator it read as "only arm right operand of ??". // 156
    if (missing.length === 1) { // 157
        const phrase = armPhrase(descriptors[missing[0] - 1]); // 158
        return [head + phrase + ' never executed' + tail]; // 159
    } // 160
 // 161
    const summary = // 162
        missing.length === gap.arms.length // 163
            ? 'no arm ever executed' // 164
            : 'arms ' + missing.join(', ') + ' of ' + gap.arms.length + ' never executed'; // 165
 // 166
    /** @type {string[]} */ // 167
    const lines = [head + summary + tail]; // 168
    for (const armIndex of missing) { // 169
        lines.push( // 170
            '  - arm ' + // 171
                armIndex + // 172
                ' of ' + // 173
                gap.arms.length + // 174
                ' — ' + // 175
                armPhrase(descriptors[armIndex - 1]) // 176
        ); // 177
    } // 178
    return lines; // 179
} // 180
```

### G8–G9 · in `sharedLineSet` · lines 221–249

- **G8** line 244 · `branch` · the arm never executed
- **G9** lines 245–246 · block · 2 statements never executed

```js
/** // 221
 * Lines that hold more than one branch gap in this region. // 222
 * // 223
 * The column exists to tell two gaps on one line apart. Everywhere else it // 224
 * repeated `col 0` and `col 22` on millions of bullets and cost the reader a // 225
 * token per line for no information. // 226
 * @param {Region} region // 227
 * @returns {Set<number>} // 228
 */ // 229
function sharedLineSet(region) { // 230
    /** @type {Map<number, number>} */ // 231
    const counts = new Map(); // 232
 // 233
    for (const item of region.gaps) { // 234
        if (item.gap.kind !== 'branch') { // 235
            continue; // 236
        } // 237
        counts.set(item.gap.line, (counts.get(item.gap.line) ?? 0) + 1); // 238
    } // 239
 // 240
    /** @type {Set<number>} */ // 241
    const shared = new Set(); // 242
    for (const [line, count] of counts) { // 243
        if (count > 1) { // 244 ← BRANCH 1/1
            shared.add(line); // 245 ← UNCOVERED
        } // 246 ← UNCOVERED
    } // 247
    return shared; // 248
} // 249
```

## `src/json-report/report.js`

Statements 429/431 (99.5 %) · Branches 65/67 (97 %) · Functions 5/5 (100 %)

### G10–G11 · in `neverCalledNote` · lines 76–123

- **G10** line 109 · `branch` · the arm never executed
- **G11** lines 110–111 · block · 2 statements never executed · says ` — see `

```js
/** // 76
 * The `Never called:` run-on line for one file. // 77
 * // 78
 * The function counter is independent of the statement and the arm counters: a // 79
 * no-op callback or an empty method has `f === 0` and contributes no gap, so // 80
 * this line used to name code the document never printed, and the reader could // 81
 * not tell "the snippet is three sections down" from "there is nothing to show". // 82
 * // 83
 * A region is found by matching the function span, not by asking whether the // 84
 * reported line falls inside the window: a long function is capped at // 85
 * `--max-lines`, and the window then legitimately starts below the declaration. // 86
 * `win.fn` names the enclosing function for the whole window, cut or not. // 87
 * @param {FileReport} file // 88
 * @param {Region[]} regions Regions already grouped for this file. // 89
 * @returns {string} // 90
 */ // 91
function neverCalledNote(file, regions) { // 92
    const parts = file.uncoveredFunctions.map(fn => { // 93
        const where = fn.line === null ? '' : ' (line ' + fn.line + ')'; // 94
        const body = code(fn.name) + where; // 95
 // 96
        // Copied to a local first: TypeScript re-widens a property inside a // 97
        // callback, because `fn.line` is not a constant from the compiler's // 98
        // point of view — the closure could observe a later write. // 99
        const line = fn.line; // 100
        const covering = // 101
            line === null // 102
                ? undefined // 103
                : regions.find(region => { // 104
                      const span = region.win.fn; // 105
                      return span !== null && span.declLine === line; // 106
                  }); // 107
 // 108
        if (covering !== undefined) { // 109 ← BRANCH 1/1
            return body + ' — see ' + labelRange(covering.gaps.map(item => item.label)); // 110 ← UNCOVERED
        } // 111 ← UNCOVERED
 // 112
        // No region means no block gap and no branch gap inside the body, which // 113
        // is exactly what there would be to print. Saying it outright beats // 114
        // leaving the reader to hunt for a snippet that does not exist — and a // 115
        // duplicate `fnMap` entry for the same arrow looks the same from here. // 116
        return body + ' — nothing to print'; // 117
    }); // 118
 // 119
    // `; ` rather than `, `: each part may carry its own clause, and a comma // 120
    // would fuse two of them into one sentence. // 121
    return 'Never called: ' + parts.join('; '); // 122
} // 123
```

### G12 · in `buildReport` · lines 260–339 (excerpt)

- **G12** line 286 · `branch` · (`: 's'`) never executed

> Lines 125–259 omitted above.

```js
    // Regions are computed once: the section loop needs them, and so does // 260
    // `Never called`, which cites the region that prints a function's body. // 261
    /** @type {Array<{ file: FileReport, regions: Region[] }>} */ // 262
    const sections = files.map(file => { // 263
        const fileGaps = labeled.filter(item => item.file === file); // 264
        return { // 265
            file, // 266
            regions: fileGaps.length === 0 ? [] : groupRegions(fileGaps, contextLines, maxLines), // 267
        }; // 268
    }); // 269
 // 270
    if (labeled.length === 0 && uncalled === 0) { // 271
        push('No uncovered lines, branches or functions were found in the selected scope.', ''); // 272
    } else { // 273
        // The leading number is the sum of the parenthetical, and the same sum // 274
        // as the `Gaps` column in the table. A reader who adds the column up // 275
        // must land on this number — that is the check the arithmetic is for. // 276
        push( // 277
            'Gaps: ' + // 278
                (labeled.length + uncalled) + // 279
                ' (' + // 280
                blockCount + // 281
                ' line blocks, ' + // 282
                branchCount + // 283
                ' branches' + // 284
                (uncalled > 0 // 285
                    ? ', ' + uncalled + ' never-called function' + (uncalled === 1 ? '' : 's') // 286 ← BRANCH 1/1
                    : '') + // 287
                ')', // 288
            '' // 289
        ); // 290
 // 291
        push('## How to read this file', ''); // 292
        push( // 293
            '- Gap labels ' + // 294
                code('G1') + // 295
                ', ' + // 296
                code('G2') + // 297
                ', ... are assigned per run and shift when lines change; do not treat them as stable identifiers.' // 298
        ); // 299
        for (const item of legend(highlight)) { // 300
            push('- ' + item); // 301
        } // 302
        push( // 303
            '- Gap bullets read ' + // 304
                code('line 343') + // 305
                '; the 0-based column is added as ' + // 306
                code('col 22') + // 307
                ' only where two gaps share a line and it is the only thing telling them apart.' // 308
        ); // 309
        push( // 310
            '- A block bullet may end with ' + // 311
                code('says `…`') + // 312
                ' — the first string literal inside the uncovered lines. It is usually the error ' + // 313
                'message, which is both the meaning and the best key to grep for in the tests.' // 314
        ); // 315
        push( // 316
            '- ' + // 317
                code('· in `catch`') + // 318
                ' and ' + // 319
                code('· in `finally`') + // 320
                ' mark a gap inside those clauses. They are the two cases that split into "a ' + // 321
                'negative test is missing" and "unreachable by contract": decide which before writing code.' // 322
        ); // 323
        push( // 324
            '- A heading that says ' + // 325
                code('no enclosing function') + // 326
                ' marks a gap outside every span in `fnMap`: an arrow in a class field, ' + // 327
                'module-level code, or a location v8 reported on a line that belongs to no function. ' + // 328
                'These are the gaps that need a decision rather than a test.' // 329
        ); // 330
        push( // 331
            '- ' + // 332
                code('Never called:') + // 333
                ' names functions whose call counter is zero. A function the document prints ' + // 334
                'already is cited by its gap labels; one marked ' + // 335
                code('nothing to print') + // 336
                ' has no uncovered statement or branch in its body, so there is no snippet to expect.' // 337
        ); // 338
        push( // 339
```

> Lines 340–431 omitted below.

## `src/json-report/source.js`

Statements 211/225 (93.8 %) · Branches 53/63 (84.1 %) · Functions 7/7 (100 %)

### G13–G17 · in `stripStringsAndComments` · lines 105–137

- **G13** line 119, col 23 · `branch` · (`&& text[i + 1] === '/'`) never executed
- **G14** line 119, col 47 · `branch` · the arm never executed
- **G15** lines 120–121 · block · 2 statements never executed
- **G16** line 126 · `branch` · the arm never executed
- **G17** lines 127–128 · block · 2 statements never executed

```js
/** // 105
 * Blank out string and comment content so brace counting sees only code. // 106
 * // 107
 * A heuristic, not a lexer: regex literals and nested template expressions are // 108
 * not understood. For finding the block that encloses a line it is enough — a // 109
 * stray `}` inside a template literal would need `\`` nesting to fool it, and // 110
 * that shape does not appear in the files this tool is pointed at. // 111
 * @param {string} text // 112
 * @returns {string} // 113
 */ // 114
export function stripStringsAndComments(text) { // 115
    let out = ''; // 116
    for (let i = 0; i < text.length; i += 1) { // 117
        const ch = text[i]; // 118
        if (ch === '/' && text[i + 1] === '/') { // 119 ← BRANCH 1/1
            break; // 120 ← UNCOVERED
        } // 121 ← UNCOVERED
        if (ch === '"' || ch === "'" || ch === '`') { // 122
            const quote = ch; // 123
            i += 1; // 124
            while (i < text.length && text[i] !== quote) { // 125
                if (text[i] === '\\') { // 126 ← BRANCH 1/1
                    i += 1; // 127 ← UNCOVERED
                } // 128 ← UNCOVERED
                i += 1; // 129
            } // 130
            out += ' '; // 131
            continue; // 132
        } // 133
        out += ch; // 134
    } // 135
    return out; // 136
} // 137
```

### G18–G20 · in `firstLiteral` · lines 139–161

- **G18** line 154 · `branch` · (`?? ''`) never executed
- **G19** line 157, col 28 · `branch` · (`?? match[2]`) never executed
- **G20** line 157, col 40 · `branch` · (`?? null`) never executed

```js
/** // 139
 * The first string literal worth quoting from a range of lines. // 140
 * // 141
 * Why this exists: an uncovered block is usually an error path, and the error // 142
 * path's whole identity is its message. `'cache.init failed'` tells the reader // 143
 * what the code does and what to grep for in `tests/`; `lines 624–626` tells // 144
 * them only where to look. Literals shorter than four characters are skipped // 145
 * because `'a'`, `''` and `'\n'` carry no meaning to a human. // 146
 * @param {string[]} lines // 147
 * @param {number} from 1-based, inclusive. // 148
 * @param {number} to 1-based, inclusive. // 149
 * @returns {string | null} // 150
 */ // 151
export function firstLiteral(lines, from, to) { // 152
    for (let n = from; n <= to && n <= lines.length; n += 1) { // 153
        const text = (lines[n - 1] ?? '').replace(/\/\/.*$/, ''); // 154 ← BRANCH 1/1
        const match = /'((?:[^'\\\n]|\\.){4,})'|"((?:[^"\\\n]|\\.){4,})"/.exec(text); // 155
        if (match !== null) { // 156
            return match[1] ?? match[2] ?? null; // 157 ← BRANCH 1/1
        } // 158
    } // 159
    return null; // 160
} // 161
```

### G21 · in `enclosingClause` · lines 163–196

- **G21** line 182 · `branch` · (`?? ''`) never executed

```js
/** // 163
 * Whether the block that encloses a line is a `catch` or a `finally`. // 164
 * // 165
 * The distinction the reader actually needs: a missing arm in a `catch` is // 166
 * either a test that has not been written or a contract that makes it // 167
 * unreachable — "add a negative test" or "c8 ignore next" — and those are // 168
 * different actions. Everywhere else the same gap means "somebody forgot a // 169
 * branch". Roughly four in ten gaps in real code are this case. // 170
 * // 171
 * Walks upwards counting braces, so a `}` in a nested block does not stop it. // 172
 * Returns `null` for every other block, including `try`: the body of a `try` // 173
 * that never ran is not a decision the reader has to make. // 174
 * @param {string[]} lines // 175
 * @param {number} from 1-based line inside the block. // 176
 * @returns {'catch' | 'finally' | null} // 177
 */ // 178
export function enclosingClause(lines, from) { // 179
    let depth = 0; // 180
    for (let n = from; n >= 1; n -= 1) { // 181
        const text = stripStringsAndComments(lines[n - 1] ?? ''); // 182 ← BRANCH 1/1
        for (let i = text.length - 1; i >= 0; i -= 1) { // 183
            const ch = text[i]; // 184
            if (ch === '}') { // 185
                depth += 1; // 186
            } else if (ch === '{') { // 187
                if (depth === 0) { // 188
                    return clauseKind(lines, n, text.slice(0, i)); // 189
                } // 190
                depth -= 1; // 191
            } // 192
        } // 193
    } // 194
    return null; // 195
} // 196
```

### G22–G27 · in `clauseKind` · lines 198–225

- **G22** line 209 · `branch` · the arm never executed
- **G23** lines 210–211 · block · 2 statements never executed · says `finally`
- **G24** lines 215–216 · block · 2 statements never executed
- **G25** line 215 · `branch` · (`// `} catch (` and `finally {` can sit on the l…`) never executed
- **G26** line 218 · `branch` · the arm never executed
- **G27** lines 219–224 · block · 6 statements never executed · says `catch`

```js
/** // 198
 * The keyword in front of the `{` that opened the block. // 199
 * @param {string[]} lines // 200
 * @param {number} line // 201
 * @param {string} head Text before the `{` on that line. // 202
 * @returns {'catch' | 'finally' | null} // 203
 */ // 204
function clauseKind(lines, line, head) { // 205
    if (/\bcatch\s*[({]/.test(head)) { // 206
        return 'catch'; // 207
    } // 208
    if (/\bfinally\b/.test(head)) { // 209 ← BRANCH 1/1
        return 'finally'; // 210 ← UNCOVERED
    } // 211 ← UNCOVERED
    if (/\S/.test(head)) { // 212
        return null; // 213
    } // 214
    // `} catch (` and `finally {` can sit on the line above when the signature // 215 ← UNCOVERED · BRANCH 1/1
    // is wrapped; `head` is then empty. // 216 ← UNCOVERED
    const previous = stripStringsAndComments(lines[line - 2] ?? ''); // 217
    if (/\bcatch\s*[({]/.test(previous)) { // 218 ← BRANCH 1/1
        return 'catch'; // 219 ← UNCOVERED
    } // 220 ← UNCOVERED
    if (/\bfinally\b/.test(previous)) { // 221 ← UNCOVERED
        return 'finally'; // 222 ← UNCOVERED
    } // 223 ← UNCOVERED
    return null; // 224 ← UNCOVERED
} // 225
```

## Fully covered files

- `src/cov2md/args.js` — Statements 153/153 (100 %) · Branches 19/19 (100 %) · Functions 4/4 (100 %)
- `src/cov2md/cli.js` — Statements 128/128 (100 %) · Branches 22/22 (100 %) · Functions 3/3 (100 %)
- `src/cov2md/fences.js` — Statements 110/110 (100 %) · Branches 8/8 (100 %) · Functions 2/2 (100 %)
- `src/cov2md/highlight.js` — Statements 96/96 (100 %) · Branches 22/22 (100 %) · Functions 4/4 (100 %)
- `src/cov2md/index.js` — Statements 9/9 (100 %) · Branches 1/1 (100 %) · Functions 0/0 (—)
- `src/cov2md/markdown.js` — Statements 147/147 (100 %) · Branches 28/28 (100 %) · Functions 7/7 (100 %)
- `src/cov2md/paths.js` — Statements 101/101 (100 %) · Branches 24/24 (100 %) · Functions 5/5 (100 %)
- `src/cov2md/ranges.js` — Statements 85/85 (100 %) · Branches 26/26 (100 %) · Functions 4/4 (100 %)
- `src/coverage-to-markdown.js` — Statements 13/13 (100 %) · Branches 1/1 (100 %) · Functions 0/0 (—)
- `src/is-main.js` — Statements 41/41 (100 %) · Branches 5/5 (100 %) · Functions 1/1 (100 %)
- `src/json-report/args.js` — Statements 149/149 (100 %) · Branches 14/14 (100 %) · Functions 4/4 (100 %)
- `src/json-report/branches.js` — Statements 144/144 (100 %) · Branches 57/57 (100 %) · Functions 2/2 (100 %)
- `src/json-report/cli.js` — Statements 279/279 (100 %) · Branches 67/67 (100 %) · Functions 5/5 (100 %)
- `src/json-report/files.js` — Statements 200/200 (100 %) · Branches 61/61 (100 %) · Functions 6/6 (100 %)
- `src/json-report/format.js` — Statements 139/139 (100 %) · Branches 28/28 (100 %) · Functions 10/10 (100 %)
- `src/json-report/freshness.js` — Statements 66/66 (100 %) · Branches 9/9 (100 %) · Functions 1/1 (100 %)
- `src/json-report/index.js` — Statements 42/42 (100 %) · Branches 1/1 (100 %) · Functions 0/0 (—)
- `src/json-report/jsonout.js` — Statements 94/94 (100 %) · Branches 9/9 (100 %) · Functions 2/2 (100 %)
- `src/json-report/provenance.js` — Statements 85/85 (100 %) · Branches 12/12 (100 %) · Functions 3/3 (100 %)
- `src/json-report/snippet.js` — Statements 348/348 (100 %) · Branches 78/78 (100 %) · Functions 9/9 (100 %)
