import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellScene } from '../js/well-scene.js';
import { getCourseHeight, getWellLayout, WELL_COURSES } from '../js/well-layout.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} must equal ${expected}`);

function fixture(t) {
    const model = createWellScene(THREE);
    const courses = model.sculpture.children.filter((object) => object.name.startsWith('well-course-'));
    t.after(() => model.dispose());
    return { model, courses };
}

test('six physical stone courses create five distinct gaps with the correct lower surfaces', (t) => {
    const { model, courses } = fixture(t);
    const layout = getWellLayout(1);
    model.update(layout);
    model.scene.updateMatrixWorld(true);
    assert.equal(courses.length, 6);
    assert.ok(courses.every((course) => course.children.length === 10));
    const gaps = courses.slice(1).map((course, index) => {
        const lower = new THREE.Box3().setFromObject(courses[index]);
        const upper = new THREE.Box3().setFromObject(course);
        const midpoint = (layout.courses[index] + getCourseHeight(index) + layout.courses[index + 1]) / 2;
        assert.ok(midpoint > lower.max.y && midpoint < upper.min.y);
        return upper.min.y - lower.max.y;
    });
    assert.equal(gaps.length, 5);
    assert.ok(gaps.every((gap) => gap > 0.25));
});

test('additional courses preserve the established rim, winch and bucket travel envelope', (t) => {
    const { model, courses } = fixture(t);
    const winch = model.scene.getObjectByName('well-winch');
    const bucket = model.scene.getObjectByName('well-bucket');
    for (const expansion of [0, 1]) {
        for (const hoist of [0, 0.5, 1]) {
            const layout = getWellLayout(expansion, hoist);
            model.update(layout);
            near(courses[0].position.y, -0.78);
            near(courses.at(-1).position.y + getCourseHeight(WELL_COURSES.count - 1), 0.525 + expansion * 1.29);
            near(winch.position.y, 0.58 + expansion * 1.29);
            near(bucket.position.y, -0.73 + hoist * 1.685);
            near(layout.axle, 1.64 + expansion * 1.29);
        }
    }
});

test('beveled stones retain real clearance throughout opening and reversing', (t) => {
    const { model, courses } = fixture(t);
    const samples = [];
    for (let frame = 0; frame <= 100; frame++) samples.push(frame / 100);
    for (let frame = 99; frame >= 0; frame--) samples.push(frame / 100);
    for (const expansion of samples) {
        model.update(getWellLayout(expansion));
        model.scene.updateMatrixWorld(true);
        const bounds = courses.map((course) => new THREE.Box3().setFromObject(course));
        for (let index = 1; index < bounds.length; index++) {
            assert.ok(bounds[index].min.y - bounds[index - 1].max.y > 0.002,
                `Courses ${index - 1} and ${index} must remain separate at expansion ${expansion}.`);
        }
    }
});
