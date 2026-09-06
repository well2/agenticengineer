import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellPourEffects } from '../js/well-pour-effects.js';

function fixture() {
    const material = new THREE.MeshStandardMaterial({ color: 0x6bb5ae });
    const effects = createWellPourEffects(THREE, material);
    return {
        ...effects,
        dispose() {
            const geometries = new Set();
            const materials = new Set([material]);
            effects.group.traverse((object) => {
                if (object.geometry) geometries.add(object.geometry);
                if (object.material) materials.add(object.material);
            });
            geometries.forEach((geometry) => geometry.dispose());
            materials.forEach((item) => item.dispose());
        },
    };
}

const input = (progress = 0.5) => ({ start: new THREE.Vector3(0.12, 1.13, -0.149), progress, flow: 1, amount: 1 });

test('the curved stream starts at the lip and lands on the real water surface inside the opening', () => {
    const effects = fixture();
    try {
        const state = input();
        effects.update(state);
        const curve = effects.stream.geometry.parameters.path;
        assert.ok(curve.getPoint(0).distanceTo(state.start) < 1e-9);
        assert.ok(curve.getPoint(1).distanceTo(effects.landing) < 1e-9);
        assert.equal(effects.landing.y, -0.42);
        const straightMiddle = state.start.clone().lerp(effects.landing, 0.5);
        assert.ok(curve.getPoint(0.5).distanceTo(straightMiddle) > 0.02);
        for (let step = 0; step <= 40; step++) {
            const point = curve.getPoint(step / 40);
            assert.ok(Math.hypot(point.x, point.z) + 0.03 < 0.8);
        }
        const ripple = effects.group.getObjectByName('well-pour-ripple-0');
        assert.ok(ripple.position.y > effects.landing.y && ripple.position.y < effects.landing.y + 0.01);
        assert.ok(Math.hypot(effects.landing.x, effects.landing.z) + 0.081 * 3 < 0.8);
    } finally { effects.dispose(); }
});

test('water highlights, splashes and ripples move while all geometry buffers are reused', () => {
    const effects = fixture();
    try {
        effects.update(input(0.45));
        const geometry = effects.stream.geometry;
        const positions = geometry.attributes.position.array;
        const original = positions.slice();
        const droplet = effects.group.getObjectByName('well-flow-highlight-0');
        const before = droplet.position.clone();
        const ripple = effects.group.getObjectByName('well-pour-ripple-0');
        const rippleScale = ripple.scale.x;
        const splash = effects.group.getObjectByName('well-pour-splash-0');
        const splashPosition = splash.position.clone();
        effects.update(input(0.47));
        assert.equal(effects.stream.geometry, geometry);
        assert.equal(geometry.attributes.position.array, positions);
        assert.notDeepEqual(positions, original);
        assert.ok(droplet.position.distanceTo(before) > 0.01);
        assert.notEqual(ripple.scale.x, rippleScale);
        assert.ok(splash.position.distanceTo(splashPosition) > 0.005);
        assert.ok(splash.position.y > effects.landing.y);
    } finally { effects.dispose(); }
});

test('dynamic tube triangle winding faces outward and matches its vertex normals', () => {
    const effects = fixture();
    try {
        effects.update(input());
        const geometry = effects.stream.geometry;
        const [a, b, c] = Array.from(geometry.index.array.slice(0, 3)).map((index) =>
            new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, index));
        const face = b.sub(a).cross(c.sub(a)).normalize();
        const normal = new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal, geometry.index.array[0]);
        assert.ok(face.dot(normal) > 0.8);
    } finally { effects.dispose(); }
});

test('effects stay hidden at rest, after completion and when the bucket is below the surface', () => {
    const effects = fixture();
    try {
        assert.equal(effects.update(), false);
        assert.equal(effects.group.visible, false);
        effects.update(input());
        assert.equal(effects.stream.visible, true);
        effects.update({ ...input(0.9), flow: 0 });
        assert.equal(effects.stream.visible, false);
        assert.equal(effects.group.visible, true);
        effects.update({ ...input(), progress: null });
        assert.equal(effects.group.visible, false);
        assert.equal(effects.stream.visible, false);
        assert.equal(effects.update(input(2)), false);
        assert.equal(effects.update({ ...input(), start: new THREE.Vector3(0, -0.43, 0) }), false);
    } finally { effects.dispose(); }
});

test('invalid animation values fail before mutating reusable stream buffers', () => {
    const effects = fixture();
    try {
        effects.update(input());
        const original = effects.stream.geometry.attributes.position.array.slice();
        for (const state of [
            { ...input(), progress: NaN }, { ...input(), flow: Infinity },
            { ...input(), start: new THREE.Vector3(NaN, 1, 0) }, { ...input(), amount: '1' },
        ]) assert.throws(() => effects.update(state), TypeError);
        assert.deepEqual(effects.stream.geometry.attributes.position.array, original);
    } finally { effects.dispose(); }
});
