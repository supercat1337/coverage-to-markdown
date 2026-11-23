// @ts-check
/**
 * Turning a branch's arms into prose.
 *
 * "Arm 2 of 2" tells nobody which test is missing. The operator between two
 * arms is not in the JSON, but the text between the end of one arm and the
 * start of the next is, and that text *is* the operator. Recovering it turns
 * "arm 2 of 2" into "right operand of ?? ('Unauthorized')".
 */

import { BT, truncate } from './format.js';
import { matchOperator, sliceSource } from './source.js';

/** @typedef {import('./types.js').FileReport} FileReport */
/** @typedef {import('./types.js').BranchGap} BranchGap */
/** @typedef {import('./types.js').BranchArm} BranchArm */
/** @typedef {import('./types.js').ArmDescriptor} ArmDescriptor */

const MAX_OPERAND_LENGTH = 48;

/** An operand made only of brackets and separators names nothing. */
const PUNCTUATION_ONLY = /^[{}()[\];,]*$/;

/**
 * Describe every arm of a branch in prose.
 * @param {FileReport} file
 * @param {BranchGap} gap
 * @returns {ArmDescriptor[]}
 */
export function armDescriptors(file, gap) {
    const sourceLines = file.sourceLines;
    /** @type {ArmDescriptor[]} */
    const out = [];

    for (let i = 0; i < gap.arms.length; i += 1) {
        const arm = gap.arms[i];
        const prev = i > 0 ? gap.arms[i - 1] : null;
        const next = i < gap.arms.length - 1 ? gap.arms[i + 1] : null;

        /** @type {string | null} */
        let before = null;
        /** @type {string | null} */
        let after = null;

        if (sourceLines) {
            if (
                prev &&
                prev.endLine !== null &&
                prev.endColumn !== null &&
                arm.line !== null &&
                arm.column !== null
            ) {
                before = matchOperator(
                    sliceSource(sourceLines, prev.endLine, prev.endColumn, arm.line, arm.column)
                );
            }
            if (
                next &&
                arm.endLine !== null &&
                arm.endColumn !== null &&
                next.line !== null &&
                next.column !== null
            ) {
                after = matchOperator(
                    sliceSource(sourceLines, arm.endLine, arm.endColumn, next.line, next.column)
                );
            }
        }

        const operator = before ?? after;
        const side = before === null ? 'left' : 'right';

        /** @type {string} */
        let role;
        if (gap.type === 'if') {
            role = i === 0 ? 'then side' : 'else side';
        } else if (gap.type === 'switch') {
            role = 'case ' + (i + 1);
        } else if (gap.type === 'default-arg') {
            role = i === 0 ? 'default value' : 'value supplied by the caller';
        } else if (operator === '?') {
            role = 'consequent of the ternary';
        } else if (operator === ':') {
            role = 'alternate of the ternary';
        } else if (operator === '?.') {
            role = side + ' side of optional chaining';
        } else if (operator !== null) {
            role = side + ' operand of ' + BT + operator + BT;
        } else if (gap.type === 'cond-expr') {
            role = i === 0 ? 'consequent of the ternary' : 'alternate of the ternary';
        } else {
            role = 'arm ' + (i + 1) + ' of ' + gap.arms.length;
        }

        /** @type {string | null} */
        let operand = null;
        if (
            sourceLines &&
            arm.line !== null &&
            arm.column !== null &&
            arm.endLine !== null &&
            arm.endColumn !== null
        ) {
            const first = sliceSource(sourceLines, arm.line, arm.column, arm.endLine, arm.endColumn)
                .split('\n')[0]
                .trim();
            const wholeLine = (sourceLines[arm.line - 1] ?? '').trim();
            const multiLine = arm.line !== arm.endLine;

            // Two shapes say nothing about which arm this is:
            //   `{`  — a v8 block range, not an expression;
            //   `;`  — an empty statement placeholder.
            // A third rule applies only to single-line arms: when the arm is
            // the whole line, it is the statement itself, already printed right
            // below the bullet. For a multi-line arm the first line is a
            // fragment of the expression — `aa  &&` of `aa  && bb` — and must
            // be kept, even when it happens to fill the line.
            if (
                first.length > 0 &&
                !PUNCTUATION_ONLY.test(first) &&
                (multiLine || first !== wholeLine)
            ) {
                operand = truncate(first, MAX_OPERAND_LENGTH);
            }
        }

        out.push({ role, operand });
    }

    return out;
}

/**
 * @param {FileReport} file
 * @param {number} line
 * @returns {boolean} True when the line holds no code, which usually means
 * the reported arm is an artefact of v8-to-istanbul.
 */
export function isPhantomLine(file, line) {
    if (!file.sourceLines) {
        return false;
    }
    return (file.sourceLines[line - 1] ?? '').trim().length === 0;
}
