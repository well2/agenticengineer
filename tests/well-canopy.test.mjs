import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellCanopy } from '../js/well-canopy.js';
import { createWellScene } from '../js/well-scene.js';
import { getWellLayout, WELL_VIEW } from '../js/well-layout.mjs';

function resources(group) {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
    });
    return { geometries, materials };
}

function dispose(group) {
    const { geometries, materials } = resources(group);
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
}

test('continuous canopy panels cover the well opening while leaving the drum and crank orbit clear', () => {
    const canopy = createWellCanopy(THREE);
    try {
        assert.equal(canopy.name, 'well-canopy');
        canopy.updateMatrixWorld(true);
        const panels = canopy.children.filter((mesh) => mesh.name.startsWith('well-canopy-panel-'));
        assert.equal(panels.length, 2);
        const cover = new THREE.Box3();
        for (const panel of panels) {
            cover.union(new THREE.Box3().setFromObject(panel));
            assert.equal(panel.material.transparent, true);
            assert.equal(panel.material.depthWrite, false);
            assert.equal(panel.castShadow, false);
            assert.ok(panel.material.opacity >= 0.28 && panel.material.opacity <= 0.38);
        }
        assert.ok(cover.min.x < -1.39 && cover.max.x > 1.39);
        assert.ok(cover.min.z < -1.09 && cover.max.z > 1.09);
        const ray = new THREE.Raycaster();
        for (const x of [-0.79, 0, 0.79]) {
            for (const z of [-0.79, -0.01, 0.01, 0.79]) {
                ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
                assert.ok(ray.intersectObjects(panels).length > 0, `Roof must cover ${x}, ${z}.`);
            }
        }
        const drum = new THREE.Box3(new THREE.Vector3(-0.47, 0.85, -0.23), new THREE.Vector3(0.47, 1.3, 0.23));
        const crankOrbit = new THREE.Box3(new THREE.Vector3(1.245, 0.595, -0.465), new THREE.Vector3(1.675, 1.525, 0.465));
        for (const mesh of canopy.children) {
            const bounds = new THREE.Box3().setFromObject(mesh);
            assert.equal(bounds.intersectsBox(drum), false, `${mesh.name} must clear the drum.`);
            assert.equal(bounds.intersectsBox(crankOrbit), false, `${mesh.name} must clear a full crank turn.`);
        }
    } finally { dispose(canopy); }
});

test('canopy stays attached to the expanded winch through orbit and extreme bucket positions', () => {
    const canopy = createWellCanopy(THREE);
    try {
        const sculpture = new THREE.Group();
        const winch = new THREE.Group();
        sculpture.add(winch);
        winch.add(canopy);
        const ridge = canopy.getObjectByName('well-canopy-ridge');
        const originalGeometry = ridge.geometry;
        for (const expansion of [0, 0.5, 1]) {
            for (const hoist of [0, 1]) {
                for (const angle of [-Math.PI, 0, Math.PI / 2]) {
                    const layout = getWellLayout(expansion, hoist);
                    winch.position.y = layout.winch;
                    sculpture.rotation.y = angle;
                    sculpture.updateMatrixWorld(true);
                    const center = ridge.getWorldPosition(new THREE.Vector3());
                    assert.ok(Math.abs(center.y - layout.winch - 1.98) < 1e-9);
                    const bounds = new THREE.Box3().setFromObject(canopy);
                    assert.ok([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite));
                    assert.ok(bounds.max.y - bounds.min.y < 1);
                    assert.equal(ridge.geometry, originalGeometry);
                }
            }
        }
    } finally { dispose(canopy); }
});

test('shared canopy materials and all geometry are discoverable for standard scene disposal', () => {
    const canopy = createWellCanopy(THREE);
    const { geometries, materials } = resources(canopy);
    assert.equal(materials.size, 3);
    assert.ok(geometries.size > 10);
    let disposed = 0;
    for (const resource of [...geometries, ...materials]) {
        resource.addEventListener('dispose', () => disposed++);
    }
    dispose(canopy);
    assert.equal(disposed, geometries.size + materials.size);
});

test('incomplete Three.js input fails before canopy resources can be allocated', () => {
    for (const invalid of [null, undefined, {}, { ...THREE, MeshStandardMaterial: null }]) {
        assert.throws(() => createWellCanopy(invalid), {
            name: 'TypeError', message: 'The well canopy requires the Three.js mesh, geometry and material APIs.',
        });
    }
});

test('the complete well, canopy and ground guide retain framing margin across orbit and expansion', () => {
    const model = createWellScene(THREE);
    const camera = new THREE.OrthographicCamera();
    const target = new THREE.Vector3(0, WELL_VIEW.targetY, 0);
    const projection = new THREE.Matrix4();
    const transform = new THREE.Matrix4();
    try {
        for (const expansion of [0, 0.5, 1]) {
            model.update(getWellLayout(expansion, 1 - expansion));
            model.sculpture.rotation.y = -0.18;
            model.scene.updateMatrixWorld(true);
            const geometry = [];
            model.scene.traverseVisible((object) => {
                if (object.geometry && !object.isInstancedMesh && !object.material.isShadowMaterial) geometry.push(object);
            });
            assert.ok(geometry.some((object) => object.name === 'well-canopy-ridge'));
            assert.ok(geometry.some((object) => object.isLine));
            for (const aspect of [0.75, 0.9]) {
                const height = WELL_VIEW.height + (aspect < 0.8 ? WELL_VIEW.narrowExtra : 0);
                camera.left = -height * aspect / 2;
                camera.right = height * aspect / 2;
                camera.top = height / 2;
                camera.bottom = -height / 2;
                camera.updateProjectionMatrix();
                for (const polar of [0.42, 1.01, 1.12, 1.36]) {
                    for (let orbit = 0; orbit < 16; orbit++) {
                        camera.position.setFromSphericalCoords(12, polar, orbit * Math.PI / 8).add(target);
                        camera.lookAt(target);
                        camera.updateMatrixWorld(true);
                        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
                        let extent = 0;
                        for (const object of geometry) {
                            transform.multiplyMatrices(projection, object.matrixWorld);
                            const e = transform.elements;
                            const vertices = object.geometry.attributes.position.array;
                            // Project real vertices so long angled roof ribs do not inflate an axis-aligned box.
                            for (let index = 0; index < vertices.length; index += 3) {
                                const x = vertices[index], y = vertices[index + 1], z = vertices[index + 2];
                                extent = Math.max(extent, Math.abs(e[0] * x + e[4] * y + e[8] * z + e[12]),
                                    Math.abs(e[1] * x + e[5] * y + e[9] * z + e[13]));
                            }
                        }
                        assert.ok(extent <= 0.97, `Clipped framing: expansion=${expansion}, aspect=${aspect}, polar=${polar}, orbit=${orbit}, extent=${extent}`);
                    }
                }
            }
        }
    } finally { model.dispose(); }
});

test('disposing the integrated scene releases each canopy resource exactly once', () => {
    const model = createWellScene(THREE);
    const canopy = model.scene.getObjectByName('well-canopy');
    assert.ok(canopy?.isGroup);
    const { geometries, materials } = resources(canopy);
    const disposals = new Map([...geometries, ...materials].map((resource) => [resource, 0]));
    for (const resource of disposals.keys()) {
        resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
    }
    model.dispose();
    assert.ok([...disposals.values()].every((count) => count === 1));
});
