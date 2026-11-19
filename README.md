# @supercat1337/coverage-to-markdown

Turn a coverage-range string — the kind of line list that `c8`, `nyc`, or
`istanbul` print when tests don't cover a block — into a Markdown document
with copy-pasteable code snippets. For every uncovered block the tool
pulls the code together with configurable **context lines** before and
after, **appends an inline `// <lineNumber>` comment**, and picks a
**safe fence** so that backticks inside the source code never break the
Markdown.

```text
$ cov2md --ranges "176-181,258-270" --input ./src/index.js --output ./coverage.md
Wrote 2 range(s) from /abs/path/src/index.js to /abs/path/coverage.md
```

## Why

When you ask someone (or an LLM) to write tests for uncovered lines, you
usually end up doing this by hand:

1. Run coverage.
2. Copy the offending line numbers.
3. Open the file, find each block, copy it, note the line numbers.

This package does steps 2–3 for you and produces a stable Markdown
artifact you can attach to a PR, an issue, or a chat message.

## Install

Global, as a CLI:

```bash
npm i -g @supercat1337/coverage-to-markdown
```

As a project dependency, for use in scripts or tests:

```bash
npm i -D @supercat1337/coverage-to-markdown
```

Requires Node.js **18 or newer**. The package has **zero runtime
dependencies** — everything is built on `node:fs`, `node:path`,
`node:url`, and `node:util`.

## CLI

Both `coverage-to-markdown` and the shorter `cov2md` alias point to the
same script after a global install.

```text
coverage-to-markdown --ranges <ranges> --input <source-file> --output <output-md> [options]
```

### Why named arguments only

All three main arguments are **required named flags**. There is no
positional form, and any leftover positional argument is rejected with a
non-zero exit code. This is deliberate: with positional arguments, a
forgotten or reordered argument can silently point `--output` at the
input file, and the source file is overwritten before you notice.

The tool also refuses to write over an existing file unless `--force`
is passed, and rejects a run where `--input` and `--output` resolve to
the same path.

### Options

| Flag                | Short | Required | Description                                  | Default                 |
| ------------------- | ----- | -------- | -------------------------------------------- | ----------------------- |
| `--ranges <ranges>` | `-r`  | yes      | Comma-separated line ranges                  |                         |
| `--input <path>`    | `-i`  | yes      | Source file to extract lines from            |                         |
| `--output <path>`   | `-o`  | yes      | Markdown file to write                       |                         |
| `--context <n>`     | `-c`  |          | Lines of context before and after each range | `2`                     |
| `--title <s>`       | `-t`  |          | Top-level heading text                       | `Coverage: <basename>`  |
| `--fence <lang>`    |       |          | Override fence language                      | Detected from extension |
| `--force`           | `-f`  |          | Overwrite the output file if it exists       | off                     |
| `--help`            | `-h`  |          | Show usage and exit                          |                         |
| `--version`         | `-v`  |          | Print the version and exit                   |                         |

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

# Force Python highlighting for a file with an unknown extension
cov2md --fence python -r "10-20" -i ./script -o ./cov.md

# Overwrite an existing output file on purpose
cov2md -r "1-5" -i ./src/index.js -o ./existing.md --force
```

### Ranges format

Comma-separated segments; each segment is either `x-y` (inclusive) or a
single line `x`:

```text
176-181,258-270,286-287,305,338-344
```

Rules:

- Whitespace around segments is ignored.
- Empty segments (`,,`) are silently dropped.
- **Overlapping and directly adjacent ranges are merged.** `5-7,8-10`
  becomes a single `5-10` block. Coverage tools occasionally report
  overlapping blocks, and rendering them separately duplicates the same
  code.
- Invalid segments (non-numeric, `end < start`, zero, negative) throw a
  descriptive error before any file is written.

### Output format

The document has one top-level heading (customisable via `--title`),
then one `## Range (start, end)` section per normalised range. Each
section contains a fenced code block with the language inferred from
the file extension, lines from `start - contextLines` through
`end + contextLines` (clamped to the file bounds), and each line
suffixed with `// <lineNumber>`.

````markdown
# Coverage: index.js

Source: `/abs/path/src/index.js`

Ranges: 1

## Range (176, 181)

```js
    const pattern = ... // 174
    const entries = ... // 175
    for (const item of entries) { // 176
        if (!item) continue; // 177
        total += item.weight; // 178
    } // 179
    return total; // 180
} // 181
// (context after) // 182
```

### Fence language

The fence language is detected from the source file extension:
`.js` → `js`, `.ts` → `ts`, `.tsx` → `tsx`, `.py` → `python`,
`.go` → `go`, `.rs` → `rust`, `.md` → `markdown`, and so on. Unknown
extensions fall back to a bare fence. Override with `--fence <lang>` or
pass `--fence ""` to disable highlighting entirely.

### Fence length

If a snippet contains backtick runs, the fence automatically grows to be
one backtick longer than the longest run inside the block. Source code
containing literal ` ``` ` (for example, Markdown fixtures or shell
scripts that print fences) will not break the rendered document.

## Safety guarantees

- **Named arguments only.** A stray positional argument is a hard error.
- **No silent overwrites.** An existing `--output` file is left intact
  unless `--force` is given.
- **No input/output collision.** `--input` and `--output` that resolve
  to the same file are rejected, even with `--force`.
- **Pre-flight validation.** `--input` must exist and be a regular file;
  `--ranges` must yield at least one range; all checks run before any
  file is opened for writing.
- **Clean errors.** Failures print a single message to stderr and exit
  with code `1` — no stack traces.

## Programmatic API

```js
import {
    parseRanges,
    normalizeRanges,
    detectFenceLanguage,
    buildMarkdown,
} from '@supercat1337/coverage-to-markdown';
```
````

### `parseRanges(input: string): Range[]`

Pure parser: splits a range string into `{ start, end }` objects.
Throws on invalid input. Does **not** merge overlapping or adjacent
ranges — that's `normalizeRanges`'s job.

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

Maps a file extension to a Markdown fence language identifier. Returns
an empty string for unknown extensions or dotfiles. Handles Windows
paths and is case-insensitive.

```js
detectFenceLanguage('/abs/path/file.ts'); // => 'ts'
detectFenceLanguage('C:\\foo\\bar.py'); // => 'python'
detectFenceLanguage('file.unknownext'); // => ''
```

### `buildMarkdown(sourcePath, lines, ranges, options?): string`

Builds the Markdown document. Normalizes ranges internally before
rendering, so overlapping input produces a single merged section.

`options` (all optional):

- `contextLines?: number` — lines of context before and after each range (default `2`).
- `title?: string` — top-level heading text (default `Coverage: <basename>`).
- `fence?: string` — fence language override. Pass `''` to disable highlighting.

```js
import { readFileSync } from 'node:fs';
import { parseRanges, buildMarkdown } from '@supercat1337/coverage-to-markdown';

const content = readFileSync('./src/index.js', 'utf8');
const lines = content.split('\n').map(line => line.replace(/\r$/, ''));
const md = buildMarkdown('./src/index.js', lines, parseRanges('10-12,20'), {
    contextLines: 5,
    title: 'My review notes',
});
```

### Types

Public types live in `src/types.d.ts`:

```ts
export interface Range {
    start: number;
    end: number;
}

export interface BuildOptions {
    contextLines?: number;
    title?: string;
    fence?: string;
}
```

## Integrating with coverage tools

### `c8`

```bash
npx c8 --reporter=text --reporter=json-summary npm test
```

`c8` doesn't emit per-line ranges as a single string, so the common
workflow is: open the HTML report, copy the offending line numbers, and
pass them to `cov2md`.

### `nyc` / `istanbul`

```bash
npx nyc --reporter=json npm test
```

The per-file JSON report contains `statementMap` / `fnMap` / `branchMap`
that you can diff against the `s` / `f` / `b` counts to derive uncovered
lines, then join them into a range string and hand it over.

## Limitations

- **Multi-line template literals:** the inline `// <n>` comment is
  appended as plain text. If a snippet lands inside a multi-line
  template literal, the comment becomes part of the string value.
- **CRLF:** trailing `\r` characters are stripped before the line-number
  comment is appended, so Windows-formatted files render correctly.
- **Out-of-bounds ranges:** a range that starts after the end of the
  file produces an empty fence rather than an error. This matches
  coverage tools that occasionally report phantom lines.

## License

MIT © Albert Bazaleev
