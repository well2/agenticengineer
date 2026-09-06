import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../vendor/three/three.module.min.js';
import { createBucketPourControl } from '../js/well-bucket-control.js';
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

function fixture(t, { noMarker = false, noTarget = false } = {}) {
    const marker = surface();
    const element = surface();
    const window = surface();
    const bounds = { left: 20, top: 40, width: 520, height: 560 };
    element.getBoundingClientRect = () => bounds;
    element.ownerDocument = { defaultView: window, getElementById: (id) => id === 'wellPour' && !noMarker ? marker : null };
    for (const target of [marker, element]) {
        target.focus = (options) => {
            target.focuses++;
            target.lastFocusOptions = options;
            element.ownerDocument.activeElement = target;
        };
    }
    const model = createWellScene(THREE);
    model.update(getWellLayout(0, 1));
    model.scene.updateMatrixWorld(true);
    if (noTarget) delete model.bucketTarget;
    const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.7, -2.7, 0.1, 50);
    camera.position.set(6.7, 5.2, 8.5);
    camera.lookAt(0, 0.93, 0);
    camera.updateMatrixWorld(true);
    let pours = 0;
    const dragStates = [];
    const control = createBucketPourControl(model, camera, element, {
        onPour() { pours++; }, onDragChange: (dragging) => dragStates.push(dragging),
    });
    t.after(() => { control.dispose(); model.dispose(); });
    return {
        marker, element, window, model, camera, control, dragStates,
        pours: () => pours,
        point() {
            const point = model.bucketTarget.getWorldPosition(new THREE.Vector3()).project(camera);
            return { clientX: bounds.left + (point.x + 1) * bounds.width / 2, clientY: bounds.top + (1 - point.y) * bounds.height / 2 };
        },
        down(extra = {}) { return element.emit('pointerdown', { target: marker, ...this.point(), ...extra }); },
        up(extra = {}) { return element.emit('pointerup', { target: marker, ...this.point(), ...extra }); },
        click(extra = {}) { return element.emit('click', { target: marker, detail: 0, ...extra }); },
    };
}

test('an eligible mouse click or touch tap pours once and suppresses its follow-up pointer click', (t) => {
    for (const pointerType of ['mouse', 'touch']) {
        const page = fixture(t);
        page.control.update(true);
        const down = page.down({ pointerType });
        assert.equal(down.prevented, true);
        assert.equal(page.element.hasPointerCapture(1), true);
        page.up({ pointerType });
        assert.equal(page.pours(), 1);
        assert.equal(page.element.hasPointerCapture(1), false);
        assert.deepEqual(page.dragStates, [true, false]);
        const click = page.click({ pointerType, detail: 1 });
        assert.equal(click.prevented, true);
        assert.equal(page.pours(), 1);
    }
});

test('the real bucket mesh is clickable without targeting the DOM button', (t) => {
    const page = fixture(t);
    page.control.update(true);
    const down = page.down({ target: page.element });
    assert.equal(down.prevented, true);
    page.up({ target: page.element });
    assert.equal(page.pours(), 1);
    assert.equal(page.marker.focuses, 1);
    assert.ok(Number.isFinite(Number.parseFloat(page.marker.style.left)));
    assert.ok(Number.isFinite(Number.parseFloat(page.marker.style.top)));
});

test('native keyboard button clicks remain available after a pointer activation', (t) => {
    const page = fixture(t);
    page.control.update(true);
    page.down();
    page.up();
    page.click({ detail: 0 });
    page.click({ detail: 0 });
    assert.equal(page.pours(), 3);
    assert.equal(page.element.emit('click', { detail: 0, target: page.element }).prevented, false);
    assert.equal(page.pours(), 3);
});

test('movement greater than six pixels cancels a click even after returning to its start', (t) => {
    const page = fixture(t);
    page.control.update(true);
    const point = page.point();
    page.down();
    page.element.emit('pointermove', { ...point, clientX: point.clientX + 7 });
    page.up();
    page.click({ detail: 1 });
    assert.equal(page.pours(), 0);
    assert.equal(page.element.hasPointerCapture(1), false);
    page.down();
    page.up({ clientX: point.clientX + 6 });
    assert.equal(page.pours(), 1);
});

test('pointer cancellation, capture loss and blur restore orbit without pouring or leaking capture', (t) => {
    for (const reason of ['pointercancel', 'lostpointercapture', 'blur']) {
        const page = fixture(t);
        page.control.update(true);
        page.down();
        page.element.emit('pointerup', { ...page.point(), pointerId: 99 });
        assert.equal(page.element.hasPointerCapture(1), true);
        if (reason === 'lostpointercapture') page.element.releasePointerCapture(1);
        (reason === 'blur' ? page.window : page.element).emit(reason);
        page.click({ detail: 1 });
        assert.equal(page.pours(), 0);
        assert.equal(page.element.hasPointerCapture(1), false);
        assert.deepEqual(page.dragStates, [true, false]);
    }
});

test('unavailable water, disabled controls and disposal leave no active button or gesture', (t) => {
    const page = fixture(t);
    page.control.update(false);
    assert.equal(page.marker.hidden, true);
    assert.equal(page.marker.disabled, true);
    assert.equal(page.down().prevented, false);
    assert.equal(page.click().prevented, false);
    page.control.update(true);
    page.down();
    page.control.setEnabled(false);
    assert.equal(page.element.hasPointerCapture(1), false);
    page.control.setEnabled(true);
    page.control.update(true);
    page.down();
    page.control.update(false);
    assert.equal(page.element.hasPointerCapture(1), false);
    page.control.update(true);
    page.down();
    page.control.dispose();
    page.control.setEnabled(true);
    page.control.update(true);
    assert.equal(page.marker.hidden, true);
    assert.equal(page.element.listenerCount(), 0);
    assert.equal(page.window.listenerCount(), 0);
    assert.equal(page.pours(), 0);
    assert.deepEqual(page.dragStates, [true, false, true, false, true, false]);
});

test('outside touches, right clicks and invalid gesture data cannot activate pouring', (t) => {
    const page = fixture(t);
    page.control.update(true);
    const outside = page.down({ target: page.element, pointerType: 'touch', clientX: -100, clientY: -100 });
    assert.equal(outside.prevented, false);
    assert.equal(page.down({ button: 2 }).prevented, false);
    assert.equal(page.down({ clientX: NaN }).prevented, false);
    page.down();
    page.up({ clientX: NaN });
    assert.equal(page.pours(), 0);
    page.element.setPointerCapture = () => { throw new Error('Pointer is no longer active'); };
    assert.doesNotThrow(() => page.down());
    assert.equal(page.element.hasPointerCapture(1), false);
    assert.deepEqual(page.dragStates, [true, false]);
});

test('missing marker or missing bucket geometry keeps the optional controller inert', (t) => {
    for (const options of [{ noMarker: true }, { noTarget: true }]) {
        const page = fixture(t, options);
        assert.doesNotThrow(() => { page.control.update(true); page.control.setEnabled(false); page.control.cancel(); page.control.dispose(); });
        assert.equal(page.element.listenerCount(), 0);
        assert.equal(page.window.listenerCount(), 0);
    }
});

test('hiding a focused pour button hands focus to the persistent model without scrolling', (t) => {
    for (const hide of ['unavailable', 'disabled', 'dispose']) {
        const page = fixture(t);
        page.control.update(true);
        page.marker.focus();
        if (hide === 'unavailable') page.control.update(false);
        else if (hide === 'disabled') page.control.setEnabled(false);
        else page.control.dispose();
        assert.equal(page.marker.hidden, true);
        assert.equal(page.marker.disabled, true);
        assert.equal(page.element.ownerDocument.activeElement, page.element);
        assert.equal(page.element.focuses, 1);
        assert.deepEqual(page.element.lastFocusOptions, { preventScroll: true });
    }
});

test('marker visibility updates never steal focus from another control or a still-visible button', (t) => {
    const page = fixture(t);
    const unrelated = surface();
    page.element.ownerDocument.activeElement = unrelated;
    page.control.update(false);
    page.control.setEnabled(false);
    assert.equal(page.element.ownerDocument.activeElement, unrelated);
    assert.equal(page.element.focuses, 0);
    page.control.setEnabled(true);
    page.control.update(true);
    page.marker.focus();
    page.control.update(true);
    assert.equal(page.element.ownerDocument.activeElement, page.marker);
    assert.equal(page.element.focuses, 0);
});
