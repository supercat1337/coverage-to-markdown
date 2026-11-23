// @ts-check

/**
 * The two barrels that are the documented entry points.
 *
 * Nothing else imports them, so a renamed export in a module turns a README
 * example into a `SyntaxError` at the user's import site while every unit test
 * keeps passing. These tests lived in `gaps.test.js` and were deleted with it,
 * which is why both `index.js` files dropped to 0 %.
 *
 * The surface is asserted *exactly*, not by presence: an export added without
 * a README line is as much a defect as one removed, because the list below is
 * the API report. `index.d.ts` is checked against the runtime barrel in the
 * same pass — that mismatch is invisible to every other test in the suite.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import test from 'ava';

import * as cov2md from '../src/cov2md/index.js';
import * as jsonReport from '../src/json-report/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** Documented surface of `src/cov2md/index.js`. */
const COV2MD_SURFACE = [
    'EXTENSION_TO_FENCE',
    'VALID_HIGHLIGHTS',
    'buildMarkdown',
    'detectFenceLanguage',
    'normalizeRanges',
    'parseRanges',
    'pickFenceLength',
    'renderSnippet',
    'splitLines',
];

/** Documented surface of `src/json-report/index.js`. */
const JSON_REPORT_SURFACE = [
    // reading and analysing
    'analyzeFile',
    'collectFunctionSpans',
    'mergeLineRanges',
    'readReport',
    'armDescriptors',
    'isPhantomLine',
    'loadSource',
    'matchOperator',
    'sliceSource',
    // selecting, ordering, labelling
    'assignLabels',
    'buildFileReport',
    'selectFiles',
    'sortFiles',
    'sumTotals',
    // snippets and regions
    'enclosingFunction',
    'expandThroughJsdoc',
    'fenceLength',
    'renderSnippet',
    'renderWindowBlock',
    'snippetBlock',
    'snippetWindow',
    'gapSpan',
    'groupRegions',
    'labelRange',
    'regionHash',
    // rendering
    'renderGapLine',
    'renderRegion',
    'buildReport',
    // provenance and formatting
    'readProvenance',
    'checkFreshness',
    'code',
    'metricLine',
    'percent',
    'percentText',
    'toDisplayPath',
    // machine-readable export
    'buildModel',
    'SCHEMA_VERSION',
    'writeModel',
];

/**
 * Compare a barrel with its documented surface, reporting both directions.
 * @param {import('ava').ExecutionContext} t
 * @param {object} barrel
 * @param {string[]} expected
 * @param {string} label
 * @returns {void}
 */
function assertExactSurface(t, barrel, expected, label) {
    const actual = Object.keys(barrel).sort();
    const want = [...expected].sort();
    const missing = want.filter(name => !actual.includes(name));
    const extra = actual.filter(name => !want.includes(name));

    t.deepEqual({ missing, extra }, { missing: [], extra: [] }, label);
}

/**
 * Names re-exported by a hand-written `.d.ts`.
 * @param {string} source
 * @returns {{ values: string[], types: string[] }}
 */
function parseBarrelDts(source) {
    /**
     * @param {RegExp} re
     * @returns {string[]}
     */
    const collect = re => {
        /** @type {string[]} */
        const names = [];
        let match;
        while ((match = re.exec(source)) !== null) {
            for (const raw of match[1].split(',')) {
                const name = raw.trim();
                if (name.length > 0) names.push(name);
            }
        }
        return names.sort();
    };

    return {
        values: collect(/export\s+\{([^}]*)\}\s+from\s+'[^']+';/g),
        types: collect(/export\s+type\s+\{([^}]*)\}\s+from\s+'[^']+';/g),
    };
}

test('the cov2md barrel exports exactly the documented surface', t => {
    assertExactSurface(t, cov2md, COV2MD_SURFACE, 'cov2md surface');

    t.is(cov2md.detectFenceLanguage('a.ts'), 'ts');
    t.deepEqual(cov2md.parseRanges('1-2'), [{ start: 1, end: 2 }]);
    t.true(
        cov2md.buildMarkdown('a.js', ['x'], [{ start: 1, end: 1 }]).startsWith('# Coverage: a.js')
    );
    t.true(Array.isArray(cov2md.VALID_HIGHLIGHTS));
});

test('the json-report barrel exports exactly the documented surface', t => {
    assertExactSurface(t, jsonReport, JSON_REPORT_SURFACE, 'json-report surface');

    t.is(jsonReport.percent(1, 4), 25);
    // Bump deliberately when the JSON model changes; this literal is the
    // contract a machine-readable consumer reads.
    t.is(jsonReport.SCHEMA_VERSION, 1);
});

test('index.d.ts re-exports every runtime name', t => {
    const source = readFileSync(resolve(root, 'src/json-report/index.d.ts'), 'utf8');
    const declared = parseBarrelDts(source).values;
    const runtime = Object.keys(jsonReport).sort();

    t.deepEqual(
        {
            missing: runtime.filter(name => !declared.includes(name)),
            extra: declared.filter(name => !runtime.includes(name)),
        },
        { missing: [], extra: [] },
        'index.d.ts must mirror index.js'
    );
});

test('types.d.ts declares every type re-exported by index.d.ts', t => {
    const typesPath = resolve(root, 'src/json-report/types.d.ts');
    if (!existsSync(typesPath)) {
        t.fail(
            "src/json-report/types.d.ts is missing: `export type { … } from './types.js'` " +
                'resolves to a file that exports nothing. Rename types.js and use `export interface`.'
        );
        return;
    }
    t.false(
        existsSync(resolve(root, 'src/json-report/types.js')),
        'types.js must not exist alongside types.d.ts'
    );

    const source = readFileSync(typesPath, 'utf8');
    /** @type {string[]} */
    const exported = [];
    const re = /export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        exported.push(match[1]);
    }

    const declared = parseBarrelDts(
        readFileSync(resolve(root, 'src/json-report/index.d.ts'), 'utf8')
    ).types;

    t.deepEqual(
        { missing: declared.filter(name => !exported.includes(name)) },
        { missing: [] },
        'every type in index.d.ts must be exported by types.d.ts'
    );
});

test('every export subpath declares types and points at an existing file', t => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

    for (const [subpath, target] of Object.entries(pkg.exports)) {
        if (subpath === './package.json') continue;

        if (typeof target === 'string') {
            t.true(existsSync(resolve(root, target)), subpath + ' → ' + target);
            continue;
        }

        t.true('types' in target, subpath + ' has no "types" condition');
        for (const file of Object.values(target)) {
            t.true(existsSync(resolve(root, file)), subpath + ' → ' + file);
        }
    }
});

test('the two barrels do not share a name by accident', t => {
    // `renderSnippet` exists in both packages — different modules, different
    // arguments. Both are documented, so both must stay, and this test records
    // that the collision is deliberate rather than a copy-paste slip.
    t.not(cov2md.renderSnippet, jsonReport.renderSnippet);
});
