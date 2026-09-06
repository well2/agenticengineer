import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellScene } from '../js/well-scene.js';
import { getWellLayout } from '../js/well-layout.mjs';
import { createWaterState, startPour, stepWater, getPourPose, getPourWaterProgress, POUR_DURATION } from '../js/well-water-state.mjs';

test('a new bucket starts empty and never fills while it is above the water', () => {
    const initial = createWaterState();
    assert.deepEqual(initial, { fill: 0, pourProgress: null, pourStartFill: 0 });
    assert.deepEqual(stepWater(initial, 1, 2000), { state: initial, animating: false });
    assert.deepEqual(initial, createWaterState());
});

test('dipping fills over700ms and lifting retains partial or complete water', () => {
    const half = stepWater(createWaterState(), 0.015, 350);
    assert.equal(half.state.fill, 0.5);
    assert.equal(half.animating, true);
    const lifted = stepWater(half.state, 0.02, 500);
    assert.equal(lifted.state.fill, 0.5);
    assert.equal(lifted.animating, false);
    const full = stepWater(lifted.state, 0, 350);
    assert.equal(full.state.fill, 1);
    assert.equal(full.animating, false);
    assert.equal(stepWater(full.state, 1, 10000).state.fill, 1);
});

test('pouring requires a nonempty bucket at the top and cannot restart an active pour', () => {
    const empty = createWaterState();
    const full = { ...empty, fill: 1 };
    assert.equal(startPour(empty, 1), empty);
    assert.equal(startPour(full, 0.969), full);
    const pouring = startPour(full, 0.97);
    assert.deepEqual(pouring, { fill: 1, pourProgress: 0, pourStartFill: 1 });
    assert.equal(startPour(pouring, 1), pouring);
    assert.equal(full.pourProgress, null);
});

test('water finishes after 2016ms while software assembly continues until 3600ms', () => {
    assert.equal(POUR_DURATION, 3600);
    const state = startPour({ ...createWaterState(), fill: 1 }, 1);
    const first = stepWater(state, 1, 360);
    assert.equal(first.state.fill, 1);
    assert.ok(getPourPose(first.state.pourProgress).tip > 0);
    const middle = stepWater(first.state, 1, 648);
    assert.ok(middle.state.fill > 0 && middle.state.fill < 0.6);
    assert.equal(getPourPose(middle.state.pourProgress).stream, 1);
    const physicalEnd = stepWater(middle.state, 1, 1008);
    assert.equal(physicalEnd.state.pourProgress, 0.56);
    assert.equal(physicalEnd.state.fill, 0);
    assert.equal(physicalEnd.animating, true);
    assert.deepEqual(getPourPose(physicalEnd.state.pourProgress), { tip: 0, stream: 0 });
    const beforeEnd = stepWater(physicalEnd.state, 1, 1583);
    assert.equal(beforeEnd.animating, true);
    assert.ok(beforeEnd.state.pourProgress < 1);
    const end = stepWater(beforeEnd.state, 1, 1);
    assert.deepEqual(end, { state: createWaterState(), animating: false });
    assert.deepEqual(state, { fill: 1, pourProgress: 0, pourStartFill: 1 });
});

test('reduced motion fills or empties immediately and leaves no animation pending', () => {
    const filled = stepWater(createWaterState(), 0, 0, true);
    assert.equal(filled.state.fill, 1);
    assert.equal(filled.animating, false);
    const pouring = startPour(filled.state, 1);
    assert.deepEqual(stepWater(pouring, 1, 0, true), { state: createWaterState(), animating: false });
});

test('negative elapsed time cannot reverse state and finite overshoot is bounded', () => {
    assert.equal(stepWater(createWaterState(), -10, -20).state.fill, 0);
    const filled = stepWater(createWaterState(), -10, 10000);
    assert.equal(filled.state.fill, 1);
    const pouring = startPour({ ...createWaterState(), fill: 4 }, 2);
    assert.equal(pouring.fill, 1);
    assert.deepEqual(stepWater(pouring, 1, 10000).state, createWaterState());
    assert.deepEqual(getPourPose(-1), { tip: 0, stream: 0 });
    assert.deepEqual(getPourPose(2), { tip: 0, stream: 0 });
    assert.equal(getPourWaterProgress(null), null);
    assert.equal(getPourWaterProgress(-1), 0);
    assert.equal(getPourWaterProgress(0.28), 0.5);
    assert.equal(getPourWaterProgress(2), 1);
});

test('invalid state, lift and frame duration are rejected before producing transforms', () => {
    const valid = createWaterState();
    for (const invalid of [NaN, Infinity, '1', null]) {
        assert.throws(() => startPour(valid, invalid), TypeError);
        assert.throws(() => stepWater(valid, 0, invalid), TypeError);
    }
    for (const invalid of [null, {}, { ...valid, fill: NaN }, { ...valid, pourProgress: '0.5' }]) {
        assert.throws(() => stepWater(invalid, 0, 16), TypeError);
    }
    assert.throws(() => getPourPose(NaN), TypeError);
    for (const invalid of [NaN, Infinity, '0.28', undefined]) {
        assert.throws(() => getPourWaterProgress(invalid), TypeError);
    }
});

test('the scene starts empty and its bucket picking target does not move with fill', () => {
    const model = createWellScene(THREE);
    try {
        const layout = getWellLayout(0, 1);
        model.update(layout);
        model.scene.updateMatrixWorld(true);
        const water = model.scene.getObjectByName('well-bucket-water');
        const target = model.bucketTarget.getWorldPosition(new THREE.Vector3());
        assert.equal(water.visible, false);
        assert.equal(model.bucketBody.name, 'well-bucket-body');
        assert.ok(model.bucketHitMeshes.includes(model.bucketBody));
        model.update(layout, { ...createWaterState(), fill: 1 });
        model.scene.updateMatrixWorld(true);
        assert.equal(water.visible, true);
        assert.ok(model.bucketTarget.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 1e-9);
    } finally {
        model.dispose();
    }
});

test('pouring rotates the bucket around its handle attachment without detaching the rope', () => {
    const model = createWellScene(THREE);
    try {
        model.sculpture.rotation.y = 0.7;
        model.update(getWellLayout(0, 1), { fill: 0.4, pourProgress: 0.28, pourStartFill: 1 });
        model.scene.updateMatrixWorld(true);
        const handle = model.scene.getObjectByName('well-bucket-handle');
        const rope = model.scene.getObjectByName('well-rope');
        const attachment = handle.localToWorld(new THREE.Vector3(0, 0.22, 0));
        const ropeEnd = rope.localToWorld(new THREE.Vector3(0, -0.5, 0));
        assert.ok(attachment.distanceTo(ropeEnd) < 1e-9);
        assert.ok(model.scene.getObjectByName('well-bucket-pour-pivot').rotation.z > 1);
    } finally {
        model.dispose();
    }
});

test('the pour stream reuses geometry and disappears together with the emptied water', () => {
    const model = createWellScene(THREE);
    try {
        const layout = getWellLayout(0, 1);
        const stream = model.scene.getObjectByName('well-pour-stream');
        const geometry = stream.geometry;
        model.update(layout, { fill: 0.4, pourProgress: 0.28, pourStartFill: 1 });
        assert.equal(stream.visible, true);
        assert.ok(stream.scale.y > 0);
        model.update(layout, { fill: 0, pourProgress: 0.9, pourStartFill: 1 });
        assert.equal(stream.visible, false);
        model.update(layout, createWaterState());
        assert.equal(stream.geometry, geometry);
        assert.equal(model.scene.getObjectByName('well-bucket-water').visible, false);
        assert.equal(model.scene.getObjectByName('well-bucket-pour-pivot').rotation.z, 0);
    } finally {
        model.dispose();
    }
});
