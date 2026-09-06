import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellTransformationEffects } from '../js/well-transformation-effects.js';
import { createWellScene } from '../js/well-scene.js';

function fixture() {
    const effects = createWellTransformationEffects(THREE);
    const parent = new THREE.Group();
    parent.rotation.y = -0.18;
    parent.add(effects.group);
    const camera = new THREE.OrthographicCamera(-2.1, 2.1, 2.625, -2.625, 0.1, 50);
    camera.position.set(6.7, 5.2, 8.5);
    camera.lookAt(0, 0.93, 0);
    return { effects, parent, camera, dispose() {
        effects.particles.dispose();
        parent.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
    } };
}

function instancePosition(mesh, index) {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
}

test('water particles visibly rise and converge without replacing geometry or instance buffers', () => {
    const page = fixture();
    try {
        const { effects, camera } = page;
        const geometry = effects.particles.geometry;
        const matrices = effects.particles.instanceMatrix.array;
        const colors = effects.particles.instanceColor.array;
        effects.update(0.23, true, camera);
        const low = Array.from({ length: 40 }, (_, index) => instancePosition(effects.particles, index).y);
        effects.update(0.48, true, camera);
        const high = Array.from({ length: 40 }, (_, index) => instancePosition(effects.particles, index).y);
        assert.ok(high.reduce((sum, value) => sum + value, 0) / 40 > low.reduce((sum, value) => sum + value, 0) / 40 + 1);
        assert.equal(effects.group.visible, true);
        assert.equal(effects.particles.count, 40);
        assert.equal(effects.particles.geometry, geometry);
        assert.equal(effects.particles.instanceMatrix.array, matrices);
        assert.equal(effects.particles.instanceColor.array, colors);
    } finally { page.dispose(); }
});

test('convergence matches a camera-facing app plane after model and camera rotation', () => {
    const page = fixture();
    try {
        const { effects, camera, parent } = page;
        parent.rotation.set(0, 0.7, 0);
        camera.position.set(-6, 4, 7);
        camera.lookAt(0, 0.93, 0);
        effects.update(0.795, true, camera);
        effects.group.updateWorldMatrix(true, true);
        const width = 420;
        const height = 525;
        const center = effects.project(camera, width, height);
        assert.equal(center.width, 3.1 * width / (camera.right - camera.left));
        for (const index of [0, 7, 32, 39]) {
            const point = effects.group.localToWorld(instancePosition(effects.particles, index)).project(camera);
            const x = (point.x * 0.5 + 0.5) * width;
            const y = (-point.y * 0.5 + 0.5) * height;
            const expectedX = center.x + (index % 8 === 0 ? -1.55 : 1.55) * width / (camera.right - camera.left);
            const expectedY = center.y + (index < 8 ? -1 : 1) * (3.1 * 160 / 260 / 2) * height / (camera.top - camera.bottom);
            assert.ok(Math.abs(x - expectedX) < 1e-4);
            assert.ok(Math.abs(y - expectedY) < 1e-4);
        }
    } finally { page.dispose(); }
});

test('idle, completed, absent delivery and reduced motion leave no visible particles or active light', () => {
    const page = fixture();
    try {
        const { effects, camera } = page;
        for (const [phase, hasDelivery, reduced] of [[null, true, false], [1, true, false], [0.5, false, false], [0.5, true, true], [-1, true, false]]) {
            effects.update(0.5, true, camera);
            assert.equal(effects.update(phase, hasDelivery, camera, reduced), false);
            assert.equal(effects.group.visible, false);
            assert.equal(effects.group.children.find((object) => object.isPointLight).intensity, 0);
        }
    } finally { page.dispose(); }
});

test('invalid phase, camera and projection dimensions are rejected without corrupting buffers', () => {
    const page = fixture();
    try {
        const { effects, camera } = page;
        effects.update(0.5, true, camera);
        const original = effects.particles.instanceMatrix.array.slice();
        for (const phase of [NaN, Infinity, '0.5', undefined]) assert.throws(() => effects.update(phase, true, camera), TypeError);
        assert.throws(() => effects.update(0.5, true, null), TypeError);
        assert.throws(() => effects.project(null, 420, 525), TypeError);
        for (const [width, height] of [[0, 525], [420, -1], [NaN, 525]]) {
            assert.throws(() => effects.project(camera, width, height), RangeError);
        }
        assert.deepEqual(effects.particles.instanceMatrix.array, original);
    } finally { page.dispose(); }
});

test('scene exposes exact delivery projection and disposes instanced particle resources', () => {
    const model = createWellScene(THREE);
    const camera = new THREE.OrthographicCamera(-2.1, 2.1, 2.625, -2.625, 0.1, 50);
    camera.position.set(6.7, 5.2, 8.5);
    camera.lookAt(0, 0.93, 0);
    model.sculpture.rotation.y = -0.18;
    model.updateTransformation(0.5, true, camera);
    const pixels = model.projectDelivery(camera, 420, 525);
    assert.ok(pixels.x > 0 && pixels.x < 420 && pixels.y > 0 && pixels.y < 525);
    assert.equal(pixels.width, 3.1 * 420 / (camera.right - camera.left));
    const particles = model.scene.getObjectByName('well-software-particles');
    let disposals = 0;
    particles.addEventListener('dispose', () => disposals++);
    model.dispose();
    assert.equal(disposals, 1);
});
