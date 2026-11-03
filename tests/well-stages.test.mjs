import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellStages, getStageReveal } from '../js/well-stages.js';
import { createWellScene } from '../js/well-scene.js';
import { getWellLayout, getCourseHeight } from '../js/well-layout.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} must equal ${expected}`);

function fixture(t, { height = 800, noList = false } = {}) {
    const document = { activeElement: null };
    const bounds = { left: 25, top: 40, width: 520, height };
    let listenerRegistrations = 0;
    const mount = {
        ownerDocument: document,
        style: {},
        getBoundingClientRect: () => bounds,
        addEventListener() { listenerRegistrations++; },
        focus(options) { document.activeElement = mount; this.lastFocusOptions = options; },
    };
    const items = Array.from({ length: 5 }, () => {
        const attributes = new Map();
        const properties = new Map();
        const link = { href: '#unchanged' };
        const item = {
            link, hidden: false, inert: false,
            contains: (target) => target === item || target === link,
            style: { setProperty: (name, value) => properties.set(name, value) },
            setAttribute: (name, value) => attributes.set(name, value),
            getAttribute: (name) => attributes.get(name),
            property: (name) => properties.get(name),
            addEventListener() { listenerRegistrations++; },
        };
        return item;
    });
    const list = {
        hidden: false,
        querySelectorAll(selector) { assert.equal(selector, ':scope > li'); return items; },
        addEventListener() { listenerRegistrations++; },
    };
    const model = createWellScene(THREE);
    model.sculpture.rotation.set(0.1, 0.6, 0);
    const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.7, -2.7, 0.1, 50);
    camera.position.set(6.7, 5.2, 8.5);
    camera.lookAt(0, 0.93, 0);
    camera.updateMatrixWorld(true);
    const stages = createWellStages(THREE, model, camera, mount, noList ? null : list);
    t.after(() => { stages.dispose(); model.dispose(); });
    return {
        document, mount, list, items, model, camera, stages, bounds,
        registrations: () => listenerRegistrations,
        update(expansion, reducedMotion = false) {
            const layout = getWellLayout(expansion, 1 - expansion);
            model.update(layout);
            model.scene.updateMatrixWorld(true);
            stages.update(layout, expansion, reducedMotion);
            return layout;
        },
        y: () => items.map((item) => Number.parseFloat(item.property('--stage-y'))),
        connectors: () => items.map((item) => ({
            target: Number.parseFloat(item.property('--stage-target-y')),
            length: Number.parseFloat(item.property('--stage-connector-length')),
            angle: Number.parseFloat(item.property('--stage-connector-angle')),
        })),
        reveals: () => items.map((item) => Number(item.property('--stage-reveal'))),
    };
}

test('all five stages reveal in order and finish before full expansion', () => {
    const starts = [0.04, 0.18, 0.32, 0.46, 0.6];
    for (const [index, start] of starts.entries()) {
        assert.equal(getStageReveal(start, index), 0);
        assert.ok(getStageReveal(start + 0.01, index) > 0);
        assert.equal(getStageReveal(start + 0.36, index), 1);
        if (index > 0) assert.ok(getStageReveal(start, index - 1) > 0);
    }
    assert.deepEqual(starts.map((_, index) => getStageReveal(0.96, index)), [1, 1, 1, 1, 1]);
});

test('reveal bounds clamp and invalid expansion or stage indices are rejected', () => {
    for (const index of [0, 1, 2, 3, 4]) {
        assert.equal(getStageReveal(-10, index), 0);
        assert.equal(getStageReveal(10, index), 1);
    }
    for (const expansion of [NaN, Infinity, -Infinity, null, '0.5']) assert.throws(() => getStageReveal(expansion, 0), TypeError);
    for (const index of [-1, 5, 0.5, NaN, '1', undefined]) assert.throws(() => getStageReveal(0.5, index), TypeError);
});

test('reveal stays continuous and reversing returns the exact earlier DOM state', (t) => {
    const page = fixture(t);
    for (const index of [0, 1, 2, 3, 4]) {
        let previous = 0;
        for (let step = 0; step <= 1000; step++) {
            const next = getStageReveal(step / 1000, index);
            assert.ok(next >= previous);
            assert.ok(next - previous < 0.0042);
            previous = next;
        }
    }
    const snapshots = [];
    for (let step = 0; step <= 20; step++) {
        page.update(step / 20);
        snapshots.push({ y: page.y(), reveals: page.reveals(), inert: page.items.map((item) => item.inert) });
    }
    for (let step = 20; step >= 0; step--) {
        page.update(step / 20);
        assert.deepEqual({ y: page.y(), reveals: page.reveals(), inert: page.items.map((item) => item.inert) }, snapshots[step]);
    }
});

test('labels follow all five real transformed gaps in canvas-local screen coordinates', (t) => {
    const page = fixture(t, { height: 1400 });
    const layout = page.update(1);
    const expected = [5, 4, 3, 2, 1].map((upper) => {
        const point = new THREE.Vector3(0, (layout.courses[upper] + layout.courses[upper - 1] + getCourseHeight(upper - 1)) / 2, 0);
        page.model.sculpture.localToWorld(point).project(page.camera);
        return (1 - point.y) * page.bounds.height / 2;
    });
    page.y().forEach((y, index) => near(y, expected[index]));
    assert.ok(page.items.every((item) => !item.hidden && !item.inert));
    page.camera.position.set(-6, 7, 8);
    page.camera.lookAt(0, 0.93, 0);
    page.update(1);
    assert.notDeepEqual(page.y(), expected);
});

test('near-edge projections remain spaced by sixty pixels and within mobile canvas bounds', (t) => {
    const page = fixture(t, { height: 300 });
    for (const targetY of [-100, 0.93, 100]) {
        page.camera.position.set(0.1, 30, 0.1);
        page.camera.lookAt(0, targetY, 0);
        page.update(1);
        const ys = page.y();
        assert.ok(ys[0] >= 30);
        assert.ok(ys.at(-1) <= 270);
        for (let index = 1; index < ys.length; index++) assert.ok(ys[index] - ys[index - 1] >= 60 - 1e-8);
    }
    page.bounds.height = 100;
    page.update(1);
    assert.ok(page.y().every((y) => y >= 30 && y <= 70));
});

test('angled connectors reach each real gap after labels separate on a short canvas', (t) => {
    const page = fixture(t, { height: 300 });
    for (const expansion of [0.4, 1, 0.4]) {
        const layout = page.update(expansion);
        const positions = page.y();
        page.connectors().forEach(({ target, length, angle }, index) => {
            const upper = 5 - index;
            const midpoint = (layout.courses[upper] + layout.courses[upper - 1] + getCourseHeight(upper - 1)) / 2;
            const point = new THREE.Vector3(0, midpoint, 0);
            page.model.sculpture.localToWorld(point).project(page.camera);
            const expected = (1 - point.y) * page.bounds.height / 2;
            near(target, expected);
            near(positions[index] + length * Math.sin(angle), expected);
            near(length * Math.cos(angle), 26);
        });
    }
    assert.ok(page.connectors().some(({ angle }) => angle !== 0));
});

test('connector endpoints remain finite for unshifted and compressed edge layouts', (t) => {
    const page = fixture(t, { height: 1400 });
    page.update(1);
    assert.ok(page.connectors().every(({ length, angle }) => length === 26 && angle === 0));
    page.bounds.height = 100;
    for (const targetY of [-100, 100]) {
        page.camera.position.set(0.1, 30, 0.1);
        page.camera.lookAt(0, targetY, 0);
        page.update(1);
        page.connectors().forEach(({ target, length, angle }, index) => {
            assert.ok([target, length, angle].every(Number.isFinite));
            near(page.y()[index] + length * Math.sin(angle), target);
            near(length * Math.cos(angle), 26);
        });
    }
});

test('invalid projection and dimensions hide labels without writing invalid connector coordinates', (t) => {
    const page = fixture(t);
    const layout = page.update(1);
    const before = page.connectors();
    for (const height of [0, -1, NaN, Infinity]) {
        page.bounds.height = height;
        page.stages.update(layout, 1);
        assert.deepEqual(page.connectors(), before);
        assert.ok(page.items.every((item) => item.hidden && item.inert));
    }
    page.bounds.height = 800;
    page.camera.projectionMatrix.elements[5] = NaN;
    page.stages.update(layout, 1);
    assert.deepEqual(page.connectors(), before);
    assert.ok(page.items.every((item) => item.hidden && item.inert));
});

test('partially visible labels stay inert and hiding focused links hands focus back without scrolling', (t) => {
    const page = fixture(t);
    page.update(1);
    page.document.activeElement = page.items[4].link;
    page.update(0.7);
    assert.equal(page.items[4].hidden, false);
    assert.equal(page.items[4].inert, true);
    assert.equal(page.items[4].getAttribute('aria-hidden'), 'true');
    assert.equal(page.document.activeElement, page.mount);
    assert.deepEqual(page.mount.lastFocusOptions, { preventScroll: true });
    const unrelated = {};
    page.document.activeElement = unrelated;
    page.stages.hide();
    assert.equal(page.document.activeElement, unrelated);
    assert.ok(page.items.every((item) => item.hidden && item.inert));
});

test('reduced motion exposes each reached stage immediately while retaining the stagger', (t) => {
    const page = fixture(t);
    page.update(0.1, true);
    assert.deepEqual(page.reveals(), [1, 0, 0, 0, 0]);
    assert.equal(page.items[0].inert, false);
    page.update(0.3, true);
    assert.deepEqual(page.reveals(), [1, 1, 0, 0, 0]);
    page.update(0.5, true);
    assert.deepEqual(page.reveals(), [1, 1, 1, 1, 0]);
    page.update(0.61, true);
    assert.deepEqual(page.reveals(), [1, 1, 1, 1, 1]);
    page.update(0, true);
    assert.deepEqual(page.reveals(), [0, 0, 0, 0, 0]);
});

test('missing or zero-sized surfaces remain safe and malformed layouts cannot mutate visible state', (t) => {
    const missing = fixture(t, { noList: true });
    assert.doesNotThrow(() => { missing.stages.update(null, NaN); missing.stages.hide(); missing.stages.dispose(); });
    const page = fixture(t);
    page.update(1);
    const before = { y: page.y(), reveals: page.reveals() };
    for (const layout of [null, {}, { courses: [0, 1] }, { courses: [0, 1, 2, 3] }, { courses: [0, 1, 2, 3, NaN, 5] }]) {
        assert.throws(() => page.stages.update(layout, 1), TypeError);
        assert.deepEqual({ y: page.y(), reveals: page.reveals() }, before);
    }
    page.bounds.height = 0;
    page.update(1);
    assert.ok(page.items.every((item) => item.hidden && item.inert));
    page.bounds.height = 800;
    page.stages.dispose();
    page.update(1);
    assert.ok(page.items.every((item) => item.hidden && item.inert));
});

test('stage updates install no input handlers and leave parent visibility and link destinations to their owners', (t) => {
    const page = fixture(t);
    page.update(1);
    page.stages.hide();
    assert.equal(page.registrations(), 0);
    assert.equal(page.list.hidden, false);
    assert.deepEqual(page.mount.style, {});
    assert.ok(page.items.every((item) => item.link.href === '#unchanged'));
});
