import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellWinding, WINDING } from '../js/well-winding.js';
import { createWellScene } from '../js/well-scene.js';
import { getWellLayout } from '../js/well-layout.mjs';

const fullAngle = WINDING.travelTurns * Math.PI * 2;
const near = (actual, expected, tolerance = 2e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} must equal ${expected}`);
const nearVector = (actual, expected) => assert.ok(actual.distanceTo(expected) < 3e-8, `${actual.toArray()} must reach ${expected.toArray()}`);

function windingFixture(t) {
    const material = new THREE.MeshStandardMaterial();
    const winding = createWellWinding(THREE, material);
    t.after(() => {
        winding.mesh.traverse((object) => object.geometry?.dispose());
        material.dispose();
    });
    return winding;
}

function visibleRing(geometry) {
    const { count, start } = geometry.drawRange;
    assert.equal(start, 0);
    assert.ok(Number.isInteger(count));
    assert.ok(count > 0 && count <= geometry.index.count);
    const radialSegments = geometry.parameters.radialSegments;
    assert.equal(count % (radialSegments * 6), 0);
    let highest = 0;
    for (let index = count - radialSegments * 6; index < count; index++) {
        highest = Math.max(highest, geometry.index.getX(index));
    }
    return Math.floor(highest / (radialSegments + 1));
}

function ringCenter(geometry, ring) {
    const center = new THREE.Vector3();
    const position = geometry.getAttribute('position');
    const radialSegments = geometry.parameters.radialSegments;
    // The last tube vertex duplicates the seam and must not bias the center.
    for (let vertex = 0; vertex < radialSegments; vertex++) {
        center.add(new THREE.Vector3().fromBufferAttribute(position, ring * (radialSegments + 1) + vertex));
    }
    return center.divideScalar(radialSegments);
}

function snapshot(winding) {
    return {
        positions: winding.mesh.geometry.getAttribute('position').array.slice(),
        normals: winding.mesh.geometry.getAttribute('normal').array.slice(),
        indices: winding.mesh.geometry.index.array.slice(),
        count: winding.mesh.geometry.drawRange.count,
        endpoint: winding.endpoint.toArray(),
        cap: winding.mesh.getObjectByName('well-wound-rope-end').position.toArray(),
    };
}

test('the visible indexed helix grows from one base wrap to three wraps and reverses monotonically', (t) => {
    const winding = windingFixture(t);
    const geometry = winding.mesh.geometry;
    const initialCount = geometry.drawRange.count;
    near(initialCount / geometry.index.count, WINDING.baseTurns / (WINDING.baseTurns + WINDING.travelTurns));
    let previous = initialCount;
    for (let step = 0; step <= 200; step++) {
        winding.update(fullAngle * step / 200);
        visibleRing(geometry);
        assert.ok(geometry.drawRange.count >= previous);
        previous = geometry.drawRange.count;
    }
    assert.equal(previous, geometry.index.count);
    for (let step = 200; step >= 0; step--) {
        winding.update(fullAngle * step / 200);
        assert.ok(geometry.drawRange.count <= previous);
        previous = geometry.drawRange.count;
    }
    assert.equal(previous, initialCount);
});

test('the last visible ring and its cap meet the actual hanging rope and bucket in world space', (t) => {
    const model = createWellScene(THREE);
    t.after(() => model.dispose());
    const wound = model.scene.getObjectByName('well-wound-rope');
    const cap = model.scene.getObjectByName('well-wound-rope-end');
    const rope = model.scene.getObjectByName('well-rope');
    const bucket = model.scene.getObjectByName('well-bucket');
    model.sculpture.rotation.set(0.13, 0.71, -0.09);
    for (const expansion of [0, 0.5, 1]) {
        for (const hoist of [0, 1e-8, 0.001, 0.1333, 0.499999, 0.5, 0.500001, 1]) {
            model.update(getWellLayout(expansion, hoist));
            model.scene.updateMatrixWorld(true);
            const end = ringCenter(wound.geometry, visibleRing(wound.geometry)).applyMatrix4(wound.matrixWorld);
            const top = new THREE.Vector3(0, 0.5, 0).applyMatrix4(rope.matrixWorld);
            const bottom = new THREE.Vector3(0, -0.5, 0).applyMatrix4(rope.matrixWorld);
            nearVector(end, top);
            nearVector(cap.getWorldPosition(new THREE.Vector3()), top);
            nearVector(bottom, bucket.localToWorld(new THREE.Vector3(0, 0.465, 0)));
        }
    }
});

test('tiny partial segments and reverse histories restore byte-identical positions and normals', (t) => {
    const direct = windingFixture(t);
    const traveled = windingFixture(t);
    const targets = [0, 1e-12, 1e-7, 0.12345, Math.PI * 2, fullAngle - 1e-7, fullAngle];
    for (const target of targets) {
        direct.update(target);
        const expected = snapshot(direct);
        for (const angle of [fullAngle, 0.731, 0.731 + 1e-10, 0.731 - 1e-10, fullAngle - 0.02, 0, target]) traveled.update(angle);
        assert.deepEqual(snapshot(traveled), expected);
        traveled.update(target);
        assert.deepEqual(snapshot(traveled), expected);
    }
});

test('integer segment boundaries expose complete indexed triangles without a spare full segment', (t) => {
    const winding = windingFixture(t);
    const geometry = winding.mesh.geometry;
    const { tubularSegments, radialSegments } = geometry.parameters;
    const totalAngle = (WINDING.baseTurns + WINDING.travelTurns) * Math.PI * 2;
    const baseAngle = WINDING.baseTurns * Math.PI * 2;
    const baseRing = tubularSegments * WINDING.baseTurns / (WINDING.baseTurns + WINDING.travelTurns);
    for (const ring of [baseRing + 1, baseRing + 48, baseRing * 2, tubularSegments - 1]) {
        const angle = ring / tubularSegments * totalAngle - baseAngle;
        for (const [offset, expectedRing] of [[-1e-7, ring], [0, ring], [1e-7, ring + 1]]) {
            winding.update(angle + offset);
            assert.equal(visibleRing(geometry), expectedRing);
            assert.equal(geometry.drawRange.count, expectedRing * radialSegments * 6);
            nearVector(ringCenter(geometry, expectedRing), winding.endpoint);
        }
    }
});

test('out-of-range angles clamp and invalid values leave all winding state unchanged', (t) => {
    const winding = windingFixture(t);
    const lowered = snapshot(winding);
    winding.update(-100);
    assert.deepEqual(snapshot(winding), lowered);
    winding.update(fullAngle);
    const raised = snapshot(winding);
    winding.update(fullAngle + 100);
    assert.deepEqual(snapshot(winding), raised);
    for (const input of [NaN, Infinity, -Infinity, '1', null, undefined, {}]) {
        assert.throws(() => winding.update(input), TypeError);
        assert.deepEqual(snapshot(winding), raised);
    }
});

test('one thousand updates reuse the geometry and every allocated attribute buffer', (t) => {
    const winding = windingFixture(t);
    const geometry = winding.mesh.geometry;
    const cap = winding.mesh.getObjectByName('well-wound-rope-end');
    const original = {
        position: geometry.getAttribute('position'), normal: geometry.getAttribute('normal'), index: geometry.index,
        positions: geometry.getAttribute('position').array, normals: geometry.getAttribute('normal').array,
        indices: geometry.index.array, capGeometry: cap.geometry, endpoint: winding.endpoint,
    };
    for (let step = 0; step < 1000; step++) {
        winding.update(fullAngle * ((step * 137) % 1000) / 999);
        assert.equal(winding.mesh.geometry, geometry);
        assert.equal(geometry.getAttribute('position'), original.position);
        assert.equal(geometry.getAttribute('normal'), original.normal);
        assert.equal(geometry.index, original.index);
        assert.equal(original.position.array, original.positions);
        assert.equal(original.normal.array, original.normals);
        assert.equal(original.index.array, original.indices);
        assert.equal(cap.geometry, original.capGeometry);
        assert.equal(winding.endpoint, original.endpoint);
    }
    assert.ok(original.positions.every(Number.isFinite));
    assert.ok(original.normals.every(Number.isFinite));
});

test('the full rope stays outside the real drum and between its flange inner faces', (t) => {
    const model = createWellScene(THREE);
    t.after(() => model.dispose());
    model.update(getWellLayout(0, 1));
    const shaft = model.scene.getObjectByName('well-winding-shaft');
    const drum = shaft.children.find((item) => item.geometry?.parameters.radiusTop === 0.135);
    const flanges = shaft.children.filter((item) => item.geometry?.parameters.radiusTop === 0.19).sort((a, b) => a.position.x - b.position.x);
    assert.ok(drum);
    assert.equal(flanges.length, 2);
    const left = flanges[0].position.x + flanges[0].geometry.parameters.height / 2;
    const right = flanges[1].position.x - flanges[1].geometry.parameters.height / 2;
    const wound = model.scene.getObjectByName('well-wound-rope');
    const position = wound.geometry.getAttribute('position');
    for (let vertex = 0; vertex < position.count; vertex++) {
        assert.ok(position.getX(vertex) > left && position.getX(vertex) < right);
        assert.ok(Math.hypot(position.getY(vertex), position.getZ(vertex)) >= drum.geometry.parameters.radiusTop - 2e-8);
    }
    assert.ok(WINDING.pitch > 2 * WINDING.ropeRadius);
    near(WINDING.radius - WINDING.ropeRadius, drum.geometry.parameters.radiusTop);
});

test('the revealed helix approaches the hanging rope downward instead of doubling back at the tangent', (t) => {
    const model = createWellScene(THREE);
    t.after(() => model.dispose());
    const wound = model.scene.getObjectByName('well-wound-rope');
    const rope = model.scene.getObjectByName('well-rope');
    model.sculpture.rotation.set(-0.08, 1.2, 0.1);
    for (const hoist of [0, 0.1213, 0.499, 0.875, 1]) {
        model.update(getWellLayout(0.4, hoist));
        model.scene.updateMatrixWorld(true);
        const finalRing = visibleRing(wound.geometry);
        const previous = ringCenter(wound.geometry, finalRing - 1).applyMatrix4(wound.matrixWorld);
        const end = ringCenter(wound.geometry, finalRing).applyMatrix4(wound.matrixWorld);
        const bottom = new THREE.Vector3(0, -0.5, 0).applyMatrix4(rope.matrixWorld);
        assert.ok(end.clone().sub(previous).normalize().dot(bottom.sub(end).normalize()) > 0.99);
    }
});
