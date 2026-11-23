# @supercat1337/coverage-to-markdown

Two complementary CLIs that turn test-coverage output into Markdown you can
attach to a PR, an issue, or a chat message.

| Command   | Aliases                     | Input                                        | Output                                                                                       |
| --------- | --------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `cov2md`  | `coverage-to-markdown`      | a coverage-range string plus one source file | one fenced snippet per range                                                                 |
| `covgaps` | `coverage-json-to-markdown` | an istanbul/c8 `coverage-final.json`         | a report of every uncovered block, every uncovered branch arm, and the provenance of the run |

`cov2md` is the small tool: you already know the line numbers and want them
rendered as code. `covgaps` is the tool that finds the line numbers for you,
including _which arm of which branch_ never executed.

Requires Node.js **18 or newer**. Pure ESM, **zero runtime dependencies** —
only `node:fs`, `node:path`, `node:url`, `node:util`, `node:crypto` and
`node:child_process`.

## Why

When you ask someone (or an LLM) to write tests for uncovered lines, you
usually end up doing this by hand:

1. Run coverage.
2. Copy the offending line numbers.
3. Open the file, find each block, copy it, note the line numbers.

`cov2md` does steps 2–3 for you. `covgaps` replaces step 2 as well, and it
distinguishes "this line never ran" from "this line ran, but one branch arm
never did" — a difference the `text` reporter of `c8` cannot express.

## Install

Global, as a CLI:

```bash
npm i -g @supercat1337/coverage-to-markdown
```

As a project dependency, for use in scripts or tests:

```bash
npm i -D @supercat1337/coverage-to-markdown
```

---

# `cov2md` — ranges to snippets

```bash
cov2md --ranges "176-181,258-270" --input ./src/index.js --output ./coverage.md
```

```text
coverage-to-markdown: wrote report
  input:  /abs/path/src/index.js
  output: /abs/path/coverage.md
  ranges: 2 (from 2 parsed)
  size:   1834 bytes
```

## CLI

```text
coverage-to-markdown --ranges <ranges> --input <source-file> --output <output-md> [options]
```

### Why named arguments only

All three main arguments are **required named flags**. There is no positional
form, and any leftover positional argument is rejected with a non-zero exit
code. This is deliberate: with positional arguments, a forgotten or reordered
argument can silently point `--output` at the input file, and the source file
is overwritten before you notice.

The tool also refuses to write over an existing file unless `--force` is
passed, and rejects a run where `--input` and `--output` resolve to the same
path.

### Options

| Flag                 | Short | Required | Description                                   | Default                 |
| -------------------- | ----- | -------- | --------------------------------------------- | ----------------------- |
| `--ranges <ranges>`  | `-r`  | yes      | Comma-separated line ranges                   |                         |
| `--input <path>`     | `-i`  | yes      | Source file to extract lines from             |                         |
| `--output <path>`    | `-o`  | yes      | Markdown file to write                        |                         |
| `--context <n>`      | `-c`  |          | Lines of context before and after each range  | `2`                     |
| `--title <s>`        | `-t`  |          | Top-level heading text                        | `Coverage: <basename>`  |
| `--fence <lang>`     |       |          | Override fence language                       | Detected from extension |
| `--highlight <mode>` |       |          | Uncovered marker: `none`, `comment`, `gutter` | `comment`               |
| `--command <cmd>`    |       |          | Add a `Reproduce:` line to the header         |                         |
| `--absolute-path`    |       |          | Print the source path as absolute             | off (relative)          |
| `--force`            | `-f`  |          | Overwrite the output file if it exists        | off                     |
| `--quiet`            | `-q`  |          | Suppress the success summary                  | off                     |
| `--help`             | `-h`  |          | Show usage and exit                           |                         |
| `--version`          | `-v`  |          | Print the version and exit                    |                         |

### Examples

```bash
# Default context of two lines
cov2md \
    --ranges "176-181,258-270,286-287" \
    --input ./src/index.js \
    --output ./coverage.md

# Ten lines of context, custom heading
cov2md -c 10 -t "Uncovered @ abc123" \
    -r "176-181" -i ./src/index.js -o ./cov.md

# Diff-style gutter, with a reproduce hint
cov2md -r "10-20" -i ./src/client.js -o ./cov.md \
    --highlight gutter \
    --command "npm test && npx c8 report --reporter=text"

# Force Python highlighting for a file with an unknown extension
cov2md --fence python -r "10-20" -i ./script -o ./cov.md

# Overwrite an existing output file on purpose
cov2md -r "1-5" -i ./src/index.js -o ./existing.md --force
```

### Output format

The document has one top-level heading (customisable via `--title`), a short
metadata block, then one `## R1 · line 56` or `## R1 · lines 111–112` section
per normalised range. Each section contains a fenced code block with the
language inferred from the file extension, lines from `start - contextLines`
through `end + contextLines` (clamped to the file bounds), and markers on
uncovered lines (controlled by `--highlight`).

The metadata block looks like this:

```text
Source: `src/client.js`
Reproduce: `npm test && npx c8 report`

3 ranges · one contiguous uncovered block each · sorted by line
Labels R1..RN are assigned per run and may change when lines shift.
```

- **`Source:`** is the input path. By default it is printed **relative to the
  current working directory** with forward slashes, so it is portable across
  machines and does not leak local file-system structure. Use
  `--absolute-path` to print the absolute path instead.
- **`Reproduce:`** appears only when `--command` is given. Backticks and
  newlines inside the command are replaced with single quotes and spaces
  respectively to keep the Markdown valid.
- **`N range(s) · …`** states the count and the range convention. The number
  and the noun are separate words (`1 range`, `2 ranges`), not a label.
- **`Labels R1..RN …`** warns that section labels are per-run and should not
  be treated as stable references across regenerations.

A full generated document:

````markdown
# Coverage: index.js

Source: `src/index.js`

2 ranges · one contiguous uncovered block each · sorted by line
Labels R1..RN are assigned per run and may change when lines shift.

## R1 · lines 176–181

```js
    const pattern = ... // 174
    const entries = ... // 175
    for (const item of entries) { // 176 ← UNCOVERED
        if (!item) continue; // 177 ← UNCOVERED
        total += item.weight; // 178 ← UNCOVERED
    } // 179 ← UNCOVERED
    return total; // 180 ← UNCOVERED
} // 181 ← UNCOVERED
```

## R2 · line 305

```js
...
```
````

### Highlight modes

`--highlight` controls how uncovered lines are marked inside each snippet.

`comment` (default) keeps every line copy-pasteable and appends a marker to the
trailing line-number comment on uncovered lines:

```js
    const pattern = ... // 174
    const entries = ... // 175
    for (const item of entries) { // 176 ← UNCOVERED
        if (!item) continue; // 177 ← UNCOVERED
        total += item.weight; // 178 ← UNCOVERED
    } // 179 ← UNCOVERED
    return total; // 180 ← UNCOVERED
} // 181 ← UNCOVERED
```

`gutter` moves the line number to the left, right-aligns it, and uses `>` for
uncovered lines. Reads like a diff, but the snippet is no longer directly
pasteable into an editor:

```js
  174 │     const pattern = ...
  175 │     const entries = ...
> 176 │     for (const item of entries) {
> 177 │         if (!item) continue;
> 178 │         total += item.weight;
> 179 │     }
> 180 │     return total;
> 181 │ }
  182 │ // (context after)
```

`none` produces the legacy snippet format: `// <n>` comments on every line, no
uncovered marker. Useful when downstream tooling parses the snippet and does
not expect a marker.

### Ranges format

Comma-separated segments; each segment is either `x-y` (inclusive) or a single
line `x`:

```text
176-181,258-270,286-287,305,338-344
```

Rules:

- Whitespace around segments is ignored.
- Empty segments (`,,`) are silently dropped.
- **Overlapping and directly adjacent ranges are merged.** `5-7,8-10` becomes a
  single `5-10` block. Coverage tools occasionally report overlapping blocks,
  and rendering them separately duplicates the same code.
- Invalid segments (non-numeric, `end < start`, zero, negative) throw a
  descriptive error before any file is written.

### Fence language

The fence language is detected from the source file extension: `.js` → `js`,
`.ts` → `ts`, `.tsx` → `tsx`, `.py` → `python`, `.go` → `go`, `.rs` → `rust`,
`.md` → `markdown`, and so on. Unknown extensions fall back to a bare fence.
Override with `--fence <lang>` or pass `--fence ""` to disable highlighting
entirely.

### Fence length

If a snippet contains backtick runs, the fence automatically grows to be one
backtick longer than the longest run inside the block, and is never shorter
than three backticks. Source code containing literal three-backtick sequences
(for example, Markdown fixtures or shell scripts that print fences) will not
break the rendered document.

## Safety guarantees

- **Named arguments only.** A stray positional argument is a hard error.
- **Existing directory.** The `--output` directory must already exist; it is
  never created.
- **No silent overwrites.** An existing `--output` file is left intact unless
  `--force` is given.
- **No input/output collision.** `--input` and `--output` that resolve to the
  same file are rejected, even with `--force`.
- **Pre-flight validation.** `--input` must exist and be a regular file;
  `--ranges` must yield at least one range; all checks run before any file is
  opened for writing.
- **Clean errors.** Failures exit with code `1`, print no stack trace, and
  prefix the message with the command name.

## Programmatic API

```js
import {
    parseRanges,
    normalizeRanges,
    detectFenceLanguage,
    buildMarkdown,
} from '@supercat1337/coverage-to-markdown';
```

### `parseRanges(input: string): Range[]`

Pure parser: splits a range string into `{ start, end }` objects. Throws on
invalid input. Does **not** merge overlapping or adjacent ranges — that is
`normalizeRanges`'s job.

```js
parseRanges('176-181,305');
// => [
//      { start: 176, end: 181 },
//      { start: 305, end: 305 },
//    ]
```

### `normalizeRanges(ranges: Range[]): Range[]`

Sorts ranges by start and merges overlapping or directly adjacent ones.

```js
normalizeRanges([
    { start: 5, end: 7 },
    { start: 8, end: 10 },
    { start: 15, end: 15 },
]);
// => [
//      { start: 5, end: 10 },
//      { start: 15, end: 15 },
//    ]
```

### `detectFenceLanguage(filePath: string): string`

Maps a file extension to a Markdown fence language identifier. Returns an empty
string for unknown extensions or dotfiles. Handles Windows paths and is
case-insensitive.

```js
detectFenceLanguage('/abs/path/file.ts'); // => 'ts'
detectFenceLanguage('C:\\foo\\bar.py'); // => 'python'
detectFenceLanguage('file.unknownext'); // => ''
```

### `buildMarkdown(sourcePath, lines, ranges, options?): string`

Builds the Markdown document. Normalizes ranges internally before rendering, so
overlapping input produces a single merged section.

`options` (all optional):

- `contextLines?: number` — lines of context before and after each range
  (default `2`). Must be a non-negative integer; anything else throws.
- `title?: string` — top-level heading text (default `Coverage: <basename>`).
- `fence?: string` — fence language override. Pass `''` to disable highlighting.
- `highlight?: 'none' | 'comment' | 'gutter'` — uncovered marker style
  (default `'comment'`). An unknown mode throws before anything is rendered.
- `command?: string` — reproduces the coverage run. Adds a `Reproduce:` line;
  backticks become single quotes and newlines become spaces.

```js
import { readFileSync } from 'node:fs';
import { parseRanges, buildMarkdown } from '@supercat1337/coverage-to-markdown';

const content = readFileSync('./src/index.js', 'utf8');
const lines = content.split('\n').map(line => line.replace(/\r$/, ''));

const md = buildMarkdown('./src/index.js', lines, parseRanges('10-12,20'), {
    contextLines: 5,
    title: 'My review notes',
    highlight: 'gutter',
    command: 'npm test && npx c8 report',
});
```

### Types

Public types live in `src/types.d.ts`:

```ts
export interface Range {
    start: number;
    end: number;
}

export type HighlightMode = 'none' | 'comment' | 'gutter';

export interface BuildOptions {
    contextLines?: number;
    title?: string;
    fence?: string;
    highlight?: HighlightMode;
    command?: string;
}
```

---

# `covgaps` — a report of everything not covered

```bash
npx c8 --all --reporter=json ava
covgaps
```

```text
coverage-json-to-markdown: wrote report
  report: /abs/path/coverage/coverage-final.json
  scope:  14 of 14 file(s)
  output: /abs/path/cov.md
  gaps:   9 (0 block(s), 9 branch(es))
  size:   11842 bytes
```

Unlike the `text` table, which mixes two different things under one list of
line numbers, this report separates them:

- a **block** — lines that never executed at all;
- a **branch** — a line that executed, but where one specific arm never did.

## CLI

```text
coverage-json-to-markdown [coverage.json] [options]
```

The report path may be a positional argument or `-i/--input`; the default is
`coverage/coverage-final.json`, which is where `c8` and `nyc` write it.

### Options

| Flag                 | Short | Description                                                                                                | Default                        |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `[coverage.json]`    |       | Path to the istanbul/c8 JSON report                                                                        | `coverage/coverage-final.json` |
| `--input <path>`     | `-i`  | Same as the positional argument                                                                            |                                |
| `--source <path>`    | `-s`  | Restrict the report to one file by absolute path, path suffix, or basename                                 | all files                      |
| `--output <path>`    | `-o`  | Markdown file to write                                                                                     | `cov.md`                       |
| `--json <path>`      |       | Also write the gaps as JSON to this path                                                                   | off                            |
| `--context <n>`      | `-c`  | Context lines around a gap when no enclosing function is found, and around every hole cut between two gaps | `2`                            |
| `--max-lines <n>`    |       | Hard cap on a snippet length                                                                               | `80`                           |
| `--sort <mode>`      |       | File order: `alpha`, `gaps`, `percent`                                                                     | `alpha`                        |
| `--title <s>`        | `-t`  | Top-level heading                                                                                          | `Coverage gaps`                |
| `--highlight <mode>` |       | Gap marker: `none`, `comment`, `gutter`                                                                    | `comment`                      |
| `--absolute-path`    |       | Print paths as absolute                                                                                    | off (relative)                 |
| `--no-git`           |       | Skip the `Dirty` line; `Revision` prints `— (git unavailable)`                                             | off                            |
| `--no-timestamp`     |       | Skip the `Generated` line (reproducible output)                                                            | off                            |
| `--force`            | `-f`  | Overwrite the output file if it exists                                                                     | off                            |
| `--quiet`            | `-q`  | Suppress the success summary                                                                               | off                            |
| `--help`             | `-h`  | Show usage and exit                                                                                        |                                |
| `--version`          | `-v`  | Print the version and exit                                                                                 |                                |

### Examples

```bash
# Whole project
covgaps

# One file, selected by path suffix
covgaps -s src/transports/dns.js -o dns.md

# Worst files first, shorter snippets
covgaps --sort gaps --max-lines 40 -o cov.md

# Reproducible output for a committed artifact
covgaps -o cov.md --no-timestamp

# Plus a machine-readable export for CI
covgaps -o cov.md --json gaps.json
```

## What is in the report

### Header and provenance

```text
Report: `coverage/coverage-final.json`

Scope: all files · 14 files

Revision: `a1b2c3d`
Dirty: 2 file(s) — `src/transports/dns.js`, `src/core/frames.js`

Generated: `2026-11-23T14:02:11.000Z`
```

Provenance answers "does the file I am looking at match this report?" without
a manual diff. `Revision` comes from `git rev-parse --short HEAD`; `Dirty`
lists the paths `git status --porcelain` reports. Both calls carry a five-second
timeout, so a hung git stalls the report for five seconds at most. Outside a
repository `Revision` degrades to `— (git unavailable)` and the `Dirty` line is
omitted entirely, so the document never claims a clean tree it could not check.

### Staleness check

Between the `c8` run and `covgaps`, the source may have changed. Every file
the report prints a snippet from is compared against the report's own
timestamp; when a file is newer, the document says so:

```text
> **Stale coverage:** 2 of 14 source file(s) changed after this report was
> written — `src/core/frames.js`, `src/transports/dns.js`.
> Line numbers below may point at code that has since moved. Regenerate before
> trusting a snippet, for example: `npx c8 --all --reporter=json ava`.
```

The list is capped at five names plus a count. A one-second grace period
absorbs the file-system timestamp granularity, and a file without an
`mtimeMs` is skipped rather than reported as stale.

### Totals and per-file table

```text
| Metric | Covered | Total | Percent |
| --- | ---: | ---: | ---: |
| Statements | 3673 | 3675 | 99.9 % |
| Branches | 663 | 671 | 98.8 % |
| Functions | 112 | 112 | 100 % |
```

### Files in scope

| File                  | SHA-256 (12)   |   Stmts | Branch | Funcs | Gaps |
| --------------------- | -------------- | ------: | -----: | ----: | ---: |
| `src/core/frames.js`  | `4f2a9c1e8b03` |   82/82 |  20/22 | 12/12 |    2 |
| `src/core/options.js` | `9d71b0c4a2ee` | 143/143 |  31/32 |   8/8 |    1 |

Every file in scope appears here, including files with zero gaps. The hash is
the first 12 hex digits of the file content read while generating the report.
It answers "which file did I show you", not "which file was measured": if the
source changed between the `c8` run and `covgaps`, the snippets match the hash
while the coverage numbers describe the earlier version. A `0/0` row means the
file has no executable statements.

Later sections list `Fully covered files` and `Files without executable code`
separately. With `--all` enabled in `c8`, an empty file in the second list is
also a hint that the module was never loaded.

### Gap sections

Each region is one heading, one bullet per gap, and the snippet the gaps share:

```text
### G1–G2 · in `describe` · lines 2–11

- **G1** line 3, col 8 · `if` · else side (`fallback`) never executed
- **G2** line 6, col 21 · `branch` · right operand of `??` (`'none'`) never executed
```

Gaps that share one snippet window share a heading and one snippet, so a
function with two uncovered branches is printed once, not twice. A window cut
by `--max-lines`, or split around a hole between two distant gaps, says
`(excerpt)` in its heading.

An uncovered block:

```text
### G1 · in `?` · lines 176–181

- **G1** lines 176–181 · block · 4 statements never executed
```

`in \`?\``is not a placeholder for a missing name: a block outside any
function has no`fnMap`entry, and`?` is what the heading prints.

A branch, with one arm never executed:

```text
### G6 · in `createDnsAdapter` · line 216

- **G6** line 216, col 59 · `branch` · right operand of `??` (`'Unauthorized'`) never executed
```

When several arms of one branch are missing, the bullet becomes a summary and
the arms are listed beneath it:

```text
- **G7** line 42, col 7 · `switch` · arms 2, 3 of 3 never executed
  - arm 2 of 3 — case 2
  - arm 3 of 3 — case 3
```

Two things make this readable without guessing:

- **The operator is recovered, not guessed.** istanbul does not store the
  operator of a branch, but it stores where one arm ends and the next begins;
  the text between those two positions _is_ the operator, comments and line
  breaks included. So an arm reads as `right operand of ?? ('Unauthorized')`
  rather than `arm 2 of 2`.
- **The enclosing function is named** (`in createDnsAdapter`), taken from
  `fnMap`, so you know where you are before reading the snippet.

If the reported line holds no code at all, the section says so explicitly:

```text
> G1: the reported line holds no code. This is most likely a v8-to-istanbul
> artefact around an implicit `else`, `default` or class field; treat it as
> noise before writing a test.
```

### Snippets

A snippet is cut to the **enclosing function**, not to a fixed number of lines,
because a two-line window answers "where" while a whole function answers
"what" — and "what" is what decides between writing a test and changing the
code.

- the span comes from `fnMap`, so no AST is parsed;
- the narrowest function containing the gap wins, but must be at least 8 lines
  long, so a one-line arrow loses to the method around it;
- the cut is extended upwards through the function's JSDoc block (up to 60
  lines), so a documented contract sits next to the uncovered branch;
- the result is capped at `--max-lines` (default 80), and anything cut is
  reported rather than silently dropped:

```text
> Lines 12–40 omitted above.
```

The direction is `above` or `below` for the edges of a window and absent for a
hole in the middle of one:

```text
> Lines 88–140 omitted
```

### JSON export

The Markdown is deliberately human-oriented, so it carries no embedded JSON.
Pass `--json <path>` to write the same gaps as a separate file:

```json
{
    "schema": 1,
    "report": "coverage/coverage-final.json",
    "scope": "all files · 14 files",
    "revision": "a1b2c3d",
    "dirty": [],
    "generated": "2026-11-23T14:02:11.000Z",
    "numbering": { "lines": "1-based", "columns": "0-based", "arms": "1-based" },
    "totals": {
        "statements": { "covered": 3673, "total": 3675 },
        "branches": { "covered": 663, "total": 671 },
        "functions": { "covered": 112, "total": 112 }
    },
    "files": [
        {
            "file": "src/transports/dns.js",
            "sha256": "4f2a9c1e8b03",
            "statements": { "covered": 82, "total": 82 },
            "branches": { "covered": 20, "total": 22 },
            "functions": { "covered": 12, "total": 12 },
            "uncalledFunctions": [],
            "gaps": [
                {
                    "label": "G6",
                    "kind": "branch",
                    "type": "branch",
                    "line": 216,
                    "column": 59,
                    "arms": [
                        {
                            "arm": 1,
                            "line": 216,
                            "column": 20,
                            "endLine": 216,
                            "endColumn": 31,
                            "hits": 3
                        },
                        {
                            "arm": 2,
                            "line": 216,
                            "column": 59,
                            "endLine": 216,
                            "endColumn": 72,
                            "hits": 0
                        }
                    ]
                }
            ]
        }
    ]
}
```

The model does not repeat itself: an uncovered arm is simply one with
`hits === 0`, so there is no second `missingArms` field that could disagree
with the first. Labels are assigned once and shared with the Markdown, so
`G6` means the same gap in both files. `schema` is bumped when the shape
changes incompatibly.

### Ordering

`--sort` controls the file order, and therefore the `G` numbering:

- `alpha` (default) — by display path;
- `gaps` — most gaps first, then alphabetically;
- `percent` — lowest statement coverage first, files without statements last.

Labels are per-run in every mode. If you reference them in a PR, pin
`--sort alpha`.

## Safety guarantees

- **Pre-flight validation.** The report must exist and be a regular file; all
  path checks run before anything is written.
- **No silent overwrites.** An existing `--output` is left intact unless
  `--force` is given.
- **No collisions.** `--output` must differ from the report path, and `--json`
  must differ from both.
- **Tolerant provenance.** Missing git, a detached HEAD, or a source file that
  is not on disk degrade the report; they never fail the run.
- **Clean errors.** Failures exit with code `1`, print no stack trace, and
  prefix the message with the command name. `--source` is the one flag that
  lists candidates, so its message spans several lines.

## Programmatic API

```js
import {
    readReport,
    selectFiles,
    buildFileReport,
    sortFiles,
    assignLabels,
    sumTotals,
    analyzeFile,
    collectFunctionSpans,
    mergeLineRanges,
    armDescriptors,
    isPhantomLine,
    enclosingFunction,
    expandThroughJsdoc,
    snippetWindow,
    matchOperator,
    sliceSource,
    buildReport,
    buildModel,
    writeModel,
    readProvenance,
    SCHEMA_VERSION,
} from '@supercat1337/coverage-to-markdown/json-report';
```

The main pipeline, in the order the CLI runs it:

```js
import {
    readReport,
    selectFiles,
    buildFileReport,
    sortFiles,
    assignLabels,
    buildReport,
} from '@supercat1337/coverage-to-markdown/json-report';

const report = readReport('coverage/coverage-final.json');
const files = sortFiles(
    selectFiles(report, 'src/index.js').map(path => buildFileReport(path, report[path], false)),
    'alpha'
);
const labeled = assignLabels(files);

const markdown = buildReport({
    title: 'Coverage gaps',
    reportDisplay: 'coverage/coverage-final.json',
    scopeText: '1 file',
    files,
    labeled,
    totals: sumTotals(files),
    contextLines: 2,
    maxLines: 80,
    highlight: 'comment',
    provenance: { revision: null, dirty: [], generated: null },
});
```

Notes on the pieces:

- `analyzeFile(filePath, entry)` returns `{ totals, gaps, reasons, uncoveredFunctions, functions }`
  for one entry of the raw JSON, without touching the file system.
- `collectFunctionSpans(fnMap)` extracts function spans, used to cut snippets.
- `enclosingFunction(spans, line, minSpan)` returns the narrowest useful span
  around a line, or `null`.
- `armDescriptors(file, gap)` returns one `{ role, operand }` per arm, with the
  operator recovered from the source.
- `matchOperator(text)` and `sliceSource(lines, …)` are the two primitives
  behind it.
- `buildModel(...)` and `writeModel(...)` produce the `--json` export;
  `SCHEMA_VERSION` is its current version.
- The staleness check (`checkFreshness(reportPath, files)`) is exported from
  this entry point. Omitting `freshness` in `buildReport` keeps the silent
  default, so pass the result explicitly to surface stale coverage in a
  custom report.

## Integrating with coverage tools

### `c8`

```bash
npx c8 --all --reporter=json ava
covgaps
```

`--all` matters: without it only files that at least one test loaded appear in
the report, so a new module with no test simply disappears and the total stays
at 100 %.

A `.c8rc.json` that makes the number meaningful:

```json
{
    "all": true,
    "perFile": true,
    "include": ["src/**/*.js"],
    "exclude": ["**/*.test.js", "**/*.spec.js"],
    "reporter": ["text", "json", "html"],
    "checkCoverage": true,
    "lines": 100,
    "functions": 100,
    "statements": 100,
    "branches": 95
}
```

- `perFile: true` is what makes each file responsible for its own number;
  without it a well-covered file hides a neighbour at zero.
- Statements, functions and lines are safe at 100 %. Branches usually are not:
  `c8` derives them from V8 block ranges, so implicit `else` blocks, class
  fields and some `default` cases produce arms that cannot be executed. Gating
  those at 100 % only produces `c8 ignore` comments, which is why 95 % is the
  default here.
- Verify the key names against `npx c8 --help` on your version; they have
  changed between majors.

`cov2md` still has a place: when someone else's coverage output gives you only
line numbers, or when you want a narrower document for a single file.

### `nyc` / `istanbul`

```bash
npx nyc --reporter=json npm test
covgaps coverage/coverage-final.json
```

The JSON format is the same, so `covgaps` reads `nyc` output unchanged. `nyc`
reports real `if` / `switch` / `cond-expr` branch types rather than the generic
`branch` from `v8-to-istanbul`, so the arm descriptions are more precise there.

## Limitations

- **Branches from `c8` are heuristic.** `c8` has no branch instrumentation; it
  derives branches from V8 block coverage. Some reported arms correspond to
  code that has no written text (implicit `else`, `catch`, class fields,
  destructuring defaults). The report flags such arms as phantom lines, but it
  cannot decide for you whether a test is possible.
- **A branch on a blank line inside an uncovered block is dropped.** The block
  already says "never executed" and the code is right above it, so the second
  bullet would only restate it. The phantom note covers branches outside a
  block; inside one, silence is deliberate.
- **`covgaps` cannot list `c8 ignore` regions.** What is excluded on purpose is
  not recoverable from the report without re-implementing `c8`'s comment rules,
  so the document does not pretend to know it. If you need it, state the reason
  next to the ignore comment in the source.
- **Snippets need the source on disk.** The report carries absolute paths, so a
  file generated on another machine will not be readable. Line numbers and
  branch tables still work; snippets are omitted with a note.
- **Multi-line template literals** (`cov2md`): the inline `// <n>` comment is
  appended as plain text. If a snippet lands inside a multi-line template
  literal, the comment becomes part of the string value.
- **CRLF** (`cov2md`): trailing `\r` characters are stripped before the
  line-number comment is appended, so Windows-formatted files render correctly.
- **Out-of-bounds ranges** (`cov2md`): a range that starts after the end of the
  file produces an empty fence rather than an error. This matches coverage tools
  that occasionally report phantom lines.

## License

MIT © Albert Bazaleev
