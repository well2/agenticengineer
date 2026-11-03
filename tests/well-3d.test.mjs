import test from 'node:test';
import assert from 'node:assert/strict';
import { getWellLayout, sampleWellTransition, getCourseHeight, WELL_COURSES } from '../js/well-layout.mjs';

test('exploding the sculpture separates courses and keeps the rope attached', () => {
    const assembled = getWellLayout(0);
    const exploded = getWellLayout(1);
    assert.equal(exploded.courses.length, 6);
    assert.equal(exploded.courses[0], assembled.courses[0]);
    assert.ok(exploded.courses.at(-1) > assembled.courses.at(-1));
    assert.ok(exploded.ropeLength > 0);
    assert.ok(Math.abs(exploded.ropeBottom + exploded.ropeLength - exploded.axle) < 1e-10);
    assert.equal(exploded.winch, exploded.courses.at(-1) + getCourseHeight(WELL_COURSES.count - 1) + WELL_COURSES.winchClearance);
});

test('layout clamps animation overshoot at both valid boundaries', () => {
    assert.deepEqual(getWellLayout(-2), getWellLayout(0));
    assert.deepEqual(getWellLayout(2), getWellLayout(1));
});

test('invalid expansion is rejected before it can corrupt scene transforms', () => {
    for (const input of [NaN, Infinity, -Infinity, '1', null]) {
        assert.throws(() => getWellLayout(input), TypeError);
    }
});

test('upper courses lift first and reverse composition retraces the same geometry', () => {
    const closed = getWellLayout(0);
    const opening = getWellLayout(0.12);
    assert.ok(opening.courses.at(-1) > closed.courses.at(-1));
    assert.equal(opening.courses[1], closed.courses[1]);
    assert.ok(opening.twists.at(-1) > 0);
    const reverse = sampleWellTransition(1, 0, 575);
    assert.deepEqual(getWellLayout(reverse.value), getWellLayout(0.5));
    assert.ok(getWellLayout(1).twists.every((angle) => Math.abs(angle) < 1e-10));
});

test('the sequence finishes after 1150ms and reversing midway does not jump', () => {
    assert.deepEqual(sampleWellTransition(0, 1, 1150), { value: 1, complete: true });
    const midway = sampleWellTransition(0, 1, 460);
    assert.equal(midway.value, 0.4);
    assert.deepEqual(sampleWellTransition(midway.value, 0, 0), { value: 0.4, complete: false });
    assert.deepEqual(sampleWellTransition(midway.value, 0, 460), { value: 0, complete: true });
});

test('reduced motion is immediate and out-of-range elapsed time is bounded', () => {
    assert.deepEqual(sampleWellTransition(0, 1, 0, true), { value: 1, complete: true });
    assert.deepEqual(sampleWellTransition(0, 1, -10), { value: 0, complete: false });
    assert.deepEqual(sampleWellTransition(0, 1, 5000), { value: 1, complete: true });
    assert.deepEqual(sampleWellTransition(1, 1, 0), { value: 1, complete: true });
});

test('non-finite animation inputs are rejected before frame scheduling', () => {
    for (const values of [[NaN, 1, 0], [0, Infinity, 0], [0, 1, NaN]]) {
        assert.throws(() => sampleWellTransition(...values), TypeError);
    }
});
