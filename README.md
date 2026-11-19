# @supercat1337/coverage-to-markdown

Turn a coverage-range string — the kind of line list that `c8`, `nyc`, or
`istanbul` print when tests don't cover a block — into a Markdown document
with copy-pasteable code snippets. For every uncovered block the tool
pulls the code together with **two context lines before and after**, and
appends an inline `// <lineNumber>` comment so the snippet is easy to
reference in a review comment, a ticket, or an LLM prompt.

```text
$ cov2md "176-181,258-270" ./src/index.js ./coverage.md
Wrote 2 range(s) from /abs/path/src/index.js to /abs/path/coverage.md
```

## Why

When you ask someone (or an LLM) to write tests for uncovered lines, you
usually end up doing this by hand:

1. Run coverage.
2. Copy the offending line numbers.
3. Open the file, find each block, copy it, note the line numbers.

This package does steps 2–3 for you, and produces a stable Markdown
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
dependencies** — everything is built on `node:fs`, `node:path`, and
`node:url`.

## CLI

Both `coverage-to-markdown` and the shorter `cov2md` alias point to the
same script after a global install. The argument order is:

```text
coverage-to-markdown <ranges> <source-file> <output-md>
```

### Example

```bash
cov2md "176-181,258-270,286-287,305,338-344" \
    ./src/index.js \
    ./coverage.md
```

### Ranges format

Comma-separated segments; each segment is either `x-y` (inclusive) or a
single line `x`.

```text
176-181,258-270,286-287,305,338-344
```

Rules:

- Whitespace around segments is ignored.
- Empty segments (`,,`) are silently dropped.
- Invalid segments (non-numeric, `end < start`, zero, negative) throw a
  descriptive error before any file is written.

### Output format

The document has one top-level heading with the source file's basename,
then one `## Range (start, end)` section per coverage segment. Each
section contains a fenced `js` code block with lines from `start - 2`
through `end + 2`, clamped to the file bounds, and each line suffixed
with `// <lineNumber>`.

````markdown
# Coverage: index.js

Source: `/abs/path/src/index.js`

Ranges: 2

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
````

````

## Programmatic API

```js
import {
    parseRanges,
    buildMarkdown,
} from '@supercat1337/coverage-to-markdown';
````

### `parseRanges(input: string): Range[]`

Parses a coverage-range string into an array of `{ start, end }` objects.
Throws on invalid input.

```js
parseRanges('176-181,305');
// => [
//      { start: 176, end: 181 },
//      { start: 305, end: 305 },
//    ]
```

### `buildMarkdown(sourcePath: string, lines: string[], ranges: Range[]): string`

Builds the Markdown document from a pre-split lines array. Useful when
you already have the file content in memory or want to feed synthetic
lines in tests.

```js
import { readFileSync } from 'node:fs';
import { parseRanges, buildMarkdown } from '@supercat1337/coverage-to-markdown';

const content = readFileSync('./src/index.js', 'utf8');
const lines = content.split('\n').map(line => line.replace(/\r$/, ''));
const md = buildMarkdown('./src/index.js', lines, parseRanges('10-12,20'));
```

### Types

The public `Range` type is declared in `src/types.d.ts`:

```ts
export interface Range {
    start: number;
    end: number;
}
```

## Integrating with coverage tools

### `c8`

```bash
npx c8 --reporter=text --reporter=json-summary npm test
```

Parse the JSON summary to get `lines.uncovered`, feed it to the CLI:

```bash
node -e '
    const s = require("./coverage/coverage-summary.json");
    const uncovered = s.total.lines.uncovered;
    // uncovered is a count, not ranges — you still need the per-file report
'
```

`c8` doesn't emit per-line ranges as a single string. The simplest
workflow is: open the HTML report, copy the offending line numbers, and
pass them to `cov2md`.

### `nyc` / `istanbul`

```bash
npx nyc --reporter=json npm test
```

The per-file JSON report contains a `statementMap` / `fnMap` / `branchMap`
that you can diff against `s` / `f` / `b` counts to derive uncovered
lines, then join them into a range string and hand it over.

## Limitations

- **Multi-line template literals:** the inline `// <n>` comment is
  appended as plain text. If a snippet lands inside a multi-line
  template literal, the comment becomes part of the string value.
  Consider excluding such files from coverage reports or slicing them
  manually.
- **CRLF:** trailing `\r` characters are stripped before the line-number
  comment is appended, so Windows-formatted files render correctly.
- **Out-of-bounds ranges:** a range that starts after the end of the
  file produces an empty snippet rather than an error. This matches
  coverage tools that occasionally report phantom lines.

## License

MIT © Albert Bazaleev
