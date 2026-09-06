import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createWellScene } from '../js/well-scene.js';
import { createWellControls } from '../js/well-controls.js';
import { createWellHoist } from '../js/well-hoist.js';
import { createBucketPourControl } from '../js/well-bucket-control.js';
import { getWellLayout } from '../js/well-layout.mjs';

function eventSurface() {
    const listeners = [];
    const attributes = new Map();
    const captures = new Set();
    return {
        style: {}, classList: { add() {}, remove() {} }, focus() {},
        clientWidth: 520, clientHeight: 560,
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
        getAttribute: (name) => attributes.get(name),
        contains(target) { return target === this; },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 520, height: 560 }),
        setPointerCapture: (id) => captures.add(id),
        hasPointerCapture: (id) => captures.has(id),
        releasePointerCapture: (id) => captures.delete(id),
        addEventListener(name, handler, options) { listeners.push({ name, handler, capture: Boolean(options?.capture) }); },
        removeEventListener(name, handler, options) {
            const index = listeners.findIndex((item) => item.name === name && item.handler === handler && item.capture === Boolean(options?.capture));
            if (index >= 0) listeners.splice(index, 1);
        },
        emit(name, properties = {}) {
            const event = {
                target: this, pointerType: 'mouse', pointerId: 1, button: 0,
                prevented: false, stopped: false,
                preventDefault() { this.prevented = true; },
                stopImmediatePropagation() { this.stopped = true; },
                ...properties,
            };
            for (const item of listeners.filter((item) => item.name === name).sort((a, b) => Number(b.capture) - Number(a.capture))) {
                if (event.stopped) break;
                item.handler(event);
            }
            return event;
        },
    };
}

function fixture(t) {
    const element = eventSurface();
    const marker = eventSurface();
    const pourMarker = eventSurface();
    marker.closest = () => marker;
    pourMarker.closest = () => pourMarker;
    const document = eventSurface();
    document.defaultView = eventSurface();
    document.documentElement = { lang: 'en' };
    document.getElementById = (id) => ({ wellCrank: marker, wellPour: pourMarker })[id] ?? null;
    element.ownerDocument = document;
    element.getRootNode = () => document;
    const model = createWellScene(THREE);
    model.sculpture.rotation.y = -0.18;
    const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.7, -2.7, 0.1, 50);
    camera.position.set(6.7, 5.2, 8.5);
    let lift = 1;
    let pours = 0;
    let controls;
    const hoist = createWellHoist(model, camera, element, {
        onChange(value) {
            lift = value;
            model.update(getWellLayout(0, lift));
            model.scene.updateMatrixWorld(true);
        },
        onDragChange: (dragging) => controls?.setEnabled(!dragging),
    });
    const pour = createBucketPourControl(model, camera, element, {
        onPour() { pours++; },
        onDragChange: (dragging) => controls?.setEnabled(!dragging),
    });
    // Match production order: crank capture must precede the native-touch guard.
    controls = createWellControls(camera, element, { matches: false }, () => {}, true);
    model.update(getWellLayout(0, lift));
    model.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    hoist.update();
    pour.update(true);
    t.after(() => { hoist.dispose(); pour.dispose(); controls.dispose(); model.dispose(); });

    return {
        element, marker, pourMarker, document, camera, controls, hoist, pour,
        lift: () => lift,
        pours: () => pours,
        startCrank(pointerType) { return element.emit('pointerdown', { target: marker, pointerType, clientX: 250, clientY: 200 }); },
        turn(pointerType) {
            element.emit('pointermove', { pointerType, clientX: 250, clientY: 340 });
        },
        settle() {
            let frames = 0;
            while (controls.update() && frames < 200) frames++;
            assert.ok(frames < 200, 'Orbit damping must settle.');
        },
    };
}

test('mouse crank gestures own capture without orbiting, then release the model for rotation', (t) => {
    const page = fixture(t);
    const initial = page.camera.position.clone();
    assert.equal(page.startCrank('mouse').prevented, true);
    assert.equal(page.element.hasPointerCapture(1), true);
    page.turn('mouse');
    assert.ok(Math.abs(page.lift() - 0.5) < 1e-12);
    page.settle();
    assert.ok(page.camera.position.distanceTo(initial) < 1e-12);
    page.element.emit('pointerup');
    assert.equal(page.element.hasPointerCapture(1), false);

    page.element.emit('pointerdown', { clientX: 20, clientY: 30 });
    page.document.emit('pointermove', { clientX: 260, clientY: 100 });
    page.document.emit('pointerup');
    page.settle();
    assert.ok(page.camera.position.distanceTo(initial) > 1);
    assert.ok(Math.abs(page.lift() - 0.5) < 1e-12);
});

test('touch on the crank precedes the orbit touch guard while outside touch remains native', (t) => {
    const page = fixture(t);
    const initial = page.camera.position.clone();
    const crank = page.startCrank('touch');
    assert.equal(crank.prevented, true);
    assert.equal(page.element.hasPointerCapture(1), true);
    page.turn('touch');
    assert.ok(Math.abs(page.lift() - 0.5) < 1e-12);
    page.element.emit('pointercancel', { pointerType: 'touch' });
    assert.equal(page.element.hasPointerCapture(1), false);
    const outside = page.element.emit('pointerdown', { pointerType: 'touch', clientX: 10, clientY: 10 });
    assert.equal(outside.prevented, false);
    assert.equal(page.element.hasPointerCapture(1), false);
    page.settle();
    assert.ok(page.camera.position.distanceTo(initial) < 1e-12);
});

test('slider keys stop before orbit handlers and model keys retain their own Home reset', (t) => {
    const page = fixture(t);
    const initial = page.camera.position.clone();
    for (const key of ['ArrowUp', 'End', 'Home', 'ArrowRight']) {
        const event = page.element.emit('keydown', { target: page.marker, key });
        assert.equal(event.prevented, true);
        assert.equal(event.stopped, true);
        page.settle();
        assert.ok(page.camera.position.distanceTo(initial) < 1e-12);
    }
    assert.equal(page.marker.getAttribute('aria-valuenow'), '3');
    assert.equal(page.lift(), 0.025);
    page.element.emit('keydown', { key: 'ArrowLeft' });
    page.settle();
    assert.ok(page.camera.position.distanceTo(initial) > 0.1);
    page.element.emit('keydown', { key: 'Home' });
    page.settle();
    assert.ok(page.camera.position.distanceTo(initial) < 1e-12);
    assert.equal(page.lift(), 0.025);
});

test('eligible bucket taps bypass orbit and pour once without changing hoist height', (t) => {
    for (const pointerType of ['mouse', 'touch']) {
        const page = fixture(t);
        const initial = page.camera.position.clone();
        const point = { target: page.pourMarker, pointerType, clientX: 180, clientY: 220 };
        const down = page.element.emit('pointerdown', point);
        assert.equal(down.prevented, true);
        assert.equal(page.element.hasPointerCapture(1), true);
        page.element.emit('pointerup', point);
        page.element.emit('click', { ...point, detail: 1 });
        assert.equal(page.pours(), 1);
        assert.equal(page.lift(), 1);
        page.settle();
        assert.ok(page.camera.position.distanceTo(initial) < 1e-12);
        page.element.emit('keydown', { key: 'ArrowLeft' });
        page.settle();
        assert.ok(page.camera.position.distanceTo(initial) > 0.1);
    }
});

test('pour-button keyboard clicks stay independent and a second touch cannot steal a hoist gesture', (t) => {
    const page = fixture(t);
    const initial = page.camera.position.clone();
    page.element.emit('click', { target: page.pourMarker, detail: 0 });
    assert.equal(page.pours(), 1);
    assert.equal(page.lift(), 1);
    page.startCrank('touch');
    page.element.emit('pointerdown', {
        target: page.pourMarker, pointerType: 'touch', pointerId: 2, isPrimary: false,
        clientX: 180, clientY: 220,
    });
    assert.equal(page.element.hasPointerCapture(2), false);
    assert.equal(page.element.hasPointerCapture(1), true);
    page.turn('touch');
    page.settle();
    assert.equal(page.lift(), 0.5);
    assert.equal(page.pours(), 1);
    assert.ok(page.camera.position.distanceTo(initial) < 1e-12);
});
