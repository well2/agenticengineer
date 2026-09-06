import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellHoist } from '../js/well-hoist.js';
import { createWellScene } from '../js/well-scene.js';
import { getWellLayout } from '../js/well-layout.mjs';

function surface() {
    const listeners = [];
    const attributes = new Map();
    const classes = new Set();
    const captures = new Set();
    return {
        style: {}, hidden: false, focuses: 0,
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: (name) => attributes.get(name),
        contains(target) { return target === this || target?.parentElement === this; },
        focus() { this.focuses++; },
        setPointerCapture: (id) => captures.add(id),
        hasPointerCapture: (id) => captures.has(id),
        releasePointerCapture: (id) => captures.delete(id),
        addEventListener(name, callback, options) {
            listeners.push({ name, callback, capture: Boolean(options?.capture) });
        },
        removeEventListener(name, callback, options) {
            const index = listeners.findIndex((item) => item.name === name && item.callback === callback && item.capture === Boolean(options?.capture));
            if (index >= 0) listeners.splice(index, 1);
        },
        listenerCount: () => listeners.length,
        emit(name, properties = {}) {
            const event = {
                target: this, pointerId: 1, pointerType: 'mouse', button: 0,
                prevented: false, stopped: false,
                preventDefault() { this.prevented = true; },
                stopImmediatePropagation() { this.stopped = true; },
                ...properties,
            };
            for (const item of listeners.filter((item) => item.name === name).sort((a, b) => Number(b.capture) - Number(a.capture))) {
                if (event.stopped) break;
                item.callback(event);
            }
            return event;
        },
    };
}

function fixture(t, { lang = 'en', expansion = 0, noMarker = false, initialLift = 1, height = 560 } = {}) {
    const window = surface();
    const marker = surface();
    const element = surface();
    const bounds = { left: 23, top: 47, width: 520, height };
    element.getBoundingClientRect = () => bounds;
    element.ownerDocument = {
        defaultView: window, documentElement: { lang },
        getElementById: (id) => id === 'wellCrank' && !noMarker ? marker : null,
    };
    const model = createWellScene(THREE);
    model.sculpture.rotation.y = -0.18;
    model.update(getWellLayout(expansion, initialLift));
    model.scene.updateMatrixWorld(true);
    const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.7, -2.7, 0.1, 50);
    camera.position.set(6.7, 5.2, 8.5);
    camera.lookAt(0, 0.93, 0);
    camera.updateMatrixWorld(true);
    const values = [];
    const dragStates = [];
    let orbitEnabled = true;
    const hoist = createWellHoist(model, camera, element, {
        initialLift,
        onChange(value) {
            values.push(value);
            model.update(getWellLayout(expansion, value));
            model.scene.updateMatrixWorld(true);
        },
        onDragChange(dragging) { dragStates.push(dragging); orbitEnabled = !dragging; },
    });
    t.after(() => { hoist.dispose(); model.dispose(); });

    function project(world) {
        const point = world.clone().project(camera);
        return { clientX: bounds.left + (point.x + 1) * bounds.width / 2, clientY: bounds.top + (1 - point.y) * bounds.height / 2 };
    }

    return {
        window, marker, element, model, camera, bounds, hoist, values, dragStates, project,
        value: () => values.at(-1) ?? initialLift,
        orbitEnabled: () => orbitEnabled,
        start(y = 200, extra = {}) {
            return element.emit('pointerdown', { target: marker, clientX: 250, clientY: y, ...extra });
        },
        move(y, extra = {}) { return element.emit('pointermove', { clientX: 250, clientY: y, ...extra }); },
        key(key, extra = {}) { return element.emit('keydown', { target: marker, key, ...extra }); },
    };
}

test('the bucket starts raised and vertical drag lowers then raises it through its full travel', (t) => {
    const page = fixture(t, { expansion: 1 });
    assert.equal(page.marker.getAttribute('aria-valuenow'), '100');
    const raised = page.model.scene.getObjectByName('well-bucket').position.y;
    const start = page.start();
    assert.equal(start.prevented, true);
    assert.equal(start.stopped, true);
    assert.equal(page.orbitEnabled(), false);
    page.move(480);
    assert.equal(page.value(), 0);
    assert.ok(page.model.scene.getObjectByName('well-bucket').position.y < raised - 1.5);
    page.move(200);
    assert.equal(page.value(), 1);
    page.element.emit('pointerup');
    assert.equal(page.element.hasPointerCapture(1), false);
    assert.deepEqual(page.dragStates, [true, false]);
});

test('horizontal movement does nothing and reversing beyond either stop responds immediately', (t) => {
    const page = fixture(t);
    page.start();
    page.move(200, { clientX: 900 });
    assert.equal(page.value(), 1);
    page.move(100);
    page.move(170);
    assert.equal(page.value(), 0.75);
    page.move(900);
    assert.equal(page.value(), 0);
    page.move(830);
    assert.equal(page.value(), 0.25);
    page.move(NaN);
    assert.equal(page.value(), 0.25);
});

test('drag distance adapts to the viewport and remains between 200 and 320 pixels', (t) => {
    for (const [height, travel] of [[200, 200], [560, 280], [1000, 320]]) {
        const page = fixture(t, { height });
        page.start(100);
        page.move(100 + travel / 2);
        assert.equal(page.value(), 0.5);
        page.move(100 + travel);
        assert.equal(page.value(), 0);
    }
});

test('the real crank grip remains a drag target while its marker stays anchored to the fixed pivot', (t) => {
    const page = fixture(t);
    page.hoist.update();
    const initialPosition = { ...page.marker.style };
    const grip = page.model.crankGrip.getWorldPosition(new THREE.Vector3());
    const start = page.element.emit('pointerdown', page.project(grip));
    assert.equal(start.prevented, true);
    assert.equal(page.marker.focuses, 1);
    page.move(page.project(grip).clientY + 70);
    page.hoist.update();
    assert.deepEqual(page.marker.style, initialPosition);
    assert.equal(page.marker.hidden, false);
});

test('external animation updates synchronize the slider without emitting user changes', (t) => {
    const page = fixture(t);
    page.hoist.update(0.4);
    assert.equal(page.marker.getAttribute('aria-valuenow'), '40');
    assert.deepEqual(page.values, []);
    page.hoist.update(NaN);
    assert.equal(page.marker.getAttribute('aria-valuenow'), '40');
    page.key('ArrowUp');
    assert.ok(Math.abs(page.value() - 0.425) < 1e-12);
    page.hoist.update(-2);
    assert.equal(page.marker.getAttribute('aria-valuenow'), '0');
    page.hoist.update(2);
    assert.equal(page.marker.getAttribute('aria-valuenow'), '100');
    assert.equal(page.values.length, 1);
});

test('keyboard actions retain localized slider values and ignore unrelated keys or modifiers', (t) => {
    for (const lang of ['en', 'cs']) {
        const page = fixture(t, { lang });
        page.key('Home');
        assert.equal(page.key('PageUp').prevented, true);
        page.key('ArrowRight');
        assert.equal(page.marker.getAttribute('aria-valuenow'), '13');
        assert.equal(page.marker.getAttribute('aria-valuetext'), lang === 'en' ? 'Bucket 13% raised' : 'Kýbl vytažený na 13 %');
        for (const [key, extra] of [['Tab', {}], ['Escape', {}], [' ', {}], ['ArrowUp', { ctrlKey: true }], ['End', { altKey: true }], ['Home', { metaKey: true }], ['ArrowDown', { target: page.element }]]) {
            assert.equal(page.key(key, extra).prevented, false);
        }
        assert.equal(page.value(), 0.125);
        page.key('End');
        page.key('PageUp');
        assert.equal(page.value(), 1);
    }
});

test('pointer cancellation, lost capture and window blur release capture and restore orbit once', (t) => {
    for (const reason of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
        const page = fixture(t);
        page.start();
        page.element.emit('pointerup', { pointerId: 99 });
        assert.equal(page.element.hasPointerCapture(1), true);
        if (reason === 'lostpointercapture') page.element.releasePointerCapture(1);
        (reason === 'blur' ? page.window : page.element).emit(reason);
        assert.equal(page.element.hasPointerCapture(1), false);
        assert.equal(page.marker.classList.contains('is-cranking'), false);
        assert.equal(page.orbitEnabled(), true);
        page.hoist.cancel();
        assert.deepEqual(page.dragStates, [true, false]);
    }
});

test('disabling or disposing an active hoist releases input and prevents later interaction', (t) => {
    const page = fixture(t);
    page.start();
    page.hoist.setEnabled(false);
    assert.equal(page.orbitEnabled(), true);
    assert.equal(page.element.hasPointerCapture(1), false);
    assert.equal(page.marker.hidden, true);
    assert.equal(page.start().prevented, false);
    page.hoist.setEnabled(true);
    page.start();
    page.hoist.dispose();
    assert.equal(page.orbitEnabled(), true);
    assert.equal(page.element.listenerCount(), 0);
    assert.equal(page.window.listenerCount(), 0);
    page.hoist.setEnabled(true);
    page.hoist.update(0);
    assert.equal(page.marker.hidden, true);
    assert.equal(page.key('Home').prevented, false);
    assert.deepEqual(page.dragStates, [true, false, true, false]);
});

test('non-crank mouse drags and outside touch retain native behavior', (t) => {
    const page = fixture(t);
    for (const pointerType of ['mouse', 'touch']) {
        const event = page.element.emit('pointerdown', { pointerType, clientX: -100, clientY: -100 });
        assert.equal(event.prevented, false);
        assert.equal(event.stopped, false);
    }
    assert.equal(page.start(200, { button: 2 }).prevented, false);
    assert.equal(page.move(400).prevented, false);
    assert.equal(page.orbitEnabled(), true);
    assert.equal(page.value(), 1);
});

test('a missing crank marker leaves the scene without attaching input handlers', (t) => {
    const page = fixture(t, { noMarker: true });
    assert.doesNotThrow(() => { page.hoist.update(1); page.hoist.cancel(); page.hoist.dispose(); });
    assert.equal(page.element.listenerCount(), 0);
    assert.equal(page.window.listenerCount(), 0);
});
