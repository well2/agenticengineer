import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { getWellLayout } from '../js/well-layout.mjs';
import { createWellScene } from '../js/well-scene.js';
import { WINDING } from '../js/well-winding.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} must equal ${expected}`);
const nearVector = (actual, expected) => assert.ok(actual.distanceTo(expected) < 1e-9);

test('two crank turns lift the dipped bucket while preserving safe rope clearance', () => {
    for (const expansion of [0, 0.5, 1]) {
        const lowered = getWellLayout(expansion, 0);
        const raised = getWellLayout(expansion, 1);
        near(lowered.bucket, -0.73);
        assert.ok(lowered.bucket + 0.295 < -0.42);
        assert.ok(raised.bucket > lowered.bucket);
        assert.ok(raised.ropeLength >= 0.22);
        if (expansion === 0) near(raised.ropeLength, 0.22);
        near(raised.ropeBottom + raised.ropeLength, raised.axle);
        near(raised.crankAngle, Math.PI * 4);
    }
});

test('hoist overshoot clamps to a reachable state at either endpoint', () => {
    assert.deepEqual(getWellLayout(0.4, -3), getWellLayout(0.4, 0));
    assert.deepEqual(getWellLayout(0.4, 3), getWellLayout(0.4, 1));
    assert.deepEqual(getWellLayout(), getWellLayout(0, 0));
});

test('invalid hoist input is rejected before it can corrupt the rope and crank transforms', () => {
    for (const hoist of [NaN, Infinity, -Infinity, '0.5', null, {}]) {
        assert.throws(() => getWellLayout(0, hoist), TypeError);
    }
});

test('expansion remains continuous and keeps the rope attached at every hoist height', () => {
    for (const hoist of [0, 0.35, 1]) {
        let previous = getWellLayout(0, hoist);
        for (let step = 1; step <= 100; step++) {
            const next = getWellLayout(step / 100, hoist);
            assert.ok(Math.abs(next.bucket - previous.bucket) < 0.05);
            assert.ok(next.ropeLength >= 0.22);
            near(next.ropeBottom + next.ropeLength, next.axle);
            near(next.crankAngle, previous.crankAngle);
            previous = next;
        }
    }
});

test('the real crank grip orbits its fixed pivot while the supports stay stationary', () => {
    const model = createWellScene(THREE);
    try {
        model.update(getWellLayout(0, 0));
        model.scene.updateMatrixWorld(true);
        const pivot = model.crankPivot.getWorldPosition(new THREE.Vector3());
        const start = model.crankGrip.getWorldPosition(new THREE.Vector3());
        near(start.y, pivot.y - 0.38);
        model.update(getWellLayout(0, 0.125));
        model.scene.updateMatrixWorld(true);
        const quarterTurn = model.crankGrip.getWorldPosition(new THREE.Vector3());
        nearVector(model.crankPivot.getWorldPosition(new THREE.Vector3()), pivot);
        near(quarterTurn.y, pivot.y);
        near(quarterTurn.z, pivot.z - 0.38);
        assert.ok(model.crankGrip.geometry.parameters.radiusTop >= 0.08);
        model.update(getWellLayout(0, 1));
        model.scene.updateMatrixWorld(true);
        nearVector(model.crankGrip.getWorldPosition(new THREE.Vector3()), start);
        near(model.scene.getObjectByName('well-winding-shaft').rotation.x, Math.PI * 4);
    } finally {
        model.dispose();
    }
});

test('actual rope geometry reaches both the axle tangent and bucket handle after rotation and expansion', () => {
    const model = createWellScene(THREE);
    try {
        model.sculpture.rotation.y = 0.7;
        const rope = model.scene.getObjectByName('well-rope');
        const bucket = model.scene.getObjectByName('well-bucket');
        for (const [expansion, hoist] of [[0, 0], [0.5, 0.4], [1, 1]]) {
            const layout = getWellLayout(expansion, hoist);
            model.update(layout);
            model.scene.updateMatrixWorld(true);
            const top = new THREE.Vector3(0, 0.5, 0).applyMatrix4(rope.matrixWorld);
            const bottom = new THREE.Vector3(0, -0.5, 0).applyMatrix4(rope.matrixWorld);
            nearVector(top, model.sculpture.localToWorld(new THREE.Vector3(bucket.position.x, layout.axle, -WINDING.radius)));
            nearVector(top, model.scene.getObjectByName('well-wound-rope-end').getWorldPosition(new THREE.Vector3()));
            nearVector(bottom, bucket.localToWorld(new THREE.Vector3(0, 0.465, 0)));
        }
    } finally {
        model.dispose();
    }
});

test('water stays inside the raised bucket and the lowered rim reaches the well water', () => {
    const model = createWellScene(THREE);
    try {
        const bucket = model.scene.getObjectByName('well-bucket');
        const water = model.scene.getObjectByName('well-water');
        const bucketWater = model.scene.getObjectByName('well-bucket-water');
        assert.equal(bucketWater.parent.parent.parent, bucket);
        assert.ok(bucketWater.geometry.parameters.radiusTop < 0.225);
        assert.ok(bucketWater.position.y < 0.295);
        assert.equal(bucketWater.material.color.getHex(), water.material.color.getHex());
        model.update(getWellLayout(0, 0), { fill: 1, pourProgress: null });
        model.scene.updateMatrixWorld(true);
        const waterLevel = water.position.y + water.geometry.parameters.height / 2;
        assert.ok(bucket.position.y + 0.295 < waterLevel);
        model.update(getWellLayout(0, 1), { fill: 1, pourProgress: null });
        model.scene.updateMatrixWorld(true);
        assert.ok(bucketWater.getWorldPosition(new THREE.Vector3()).y > waterLevel);
    } finally {
        model.dispose();
    }
});
