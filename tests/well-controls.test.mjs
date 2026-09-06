import assert from 'node:assert/strict';
import test from 'node:test';
import { OrthographicCamera } from '../vendor/three/three.module.min.js';
import { createWellControls } from '../js/well-controls.js';

function surface() {
    const listeners = [];
    const attributes = new Map();
    return {
        style: {}, clientHeight: 500, clientWidth: 420, captures: 0,
        addEventListener(name, callback, options) { listeners.push({ name, callback, capture: Boolean(options?.capture) }); },
        removeEventListener(name, callback) {
            const index = listeners.findIndex((item) => item.name === name && item.callback === callback);
            if (index >= 0) listeners.splice(index, 1);
        },
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: (name) => attributes.delete(name),
        getAttribute: (name) => attributes.get(name),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 500 }),
        setPointerCapture() { this.captures++; },
        releasePointerCapture() { this.captures--; },
        listenerCount: () => listeners.length,
        emit(name, properties = {}) {
            let stopped = false;
            const event = {
                prevented: false, preventDefault() { this.prevented = true; },
                stopImmediatePropagation() { stopped = true; }, ...properties,
            };
            for (const item of listeners.filter((item) => item.name === name).sort((a, b) => Number(b.capture) - Number(a.capture))) {
                if (stopped) break;
                item.callback(event);
            }
            return event;
        },
    };
}

function fixture(reduced = false) {
    const element = surface();
    const document = surface();
    document.getElementById = () => null;
    element.ownerDocument = document;
    element.getRootNode = () => document;
    const camera = new OrthographicCamera(-2, 2, 2.5, -2.5, 0.1, 50);
    camera.position.set(6.7, 5.2, 8.5);
    const motion = { matches: reduced };
    let changes = 0;
    const controls = createWellControls(camera, element, motion, () => changes++, true);
    return {
        camera, element, document, motion, controls,
        changes: () => changes,
        settle() {
            let frames = 0;
            while (controls.update() && frames < 200) frames++;
            assert.ok(frames < 200, 'Damping must stop scheduling renders.');
        },
    };
}

test('mouse drag captures rotation and retains the chosen angle after settling', () => {
    const page = fixture();
    const initial = page.camera.position.clone();
    page.element.emit('pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 150 });
    assert.equal(page.element.captures, 1);
    page.document.emit('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: 360, clientY: 180 });
    page.document.emit('pointerup', { pointerId: 1, pointerType: 'mouse' });
    page.settle();
    assert.ok(page.camera.position.distanceTo(initial) > 2);
    const chosen = page.camera.position.clone();
    for (let frame = 0; frame < 30; frame++) page.controls.update();
    assert.ok(page.camera.position.distanceTo(chosen) < 0.01);
    assert.ok(page.changes() > 0);
    page.controls.dispose();
    assert.equal(page.element.listenerCount(), 0);
    assert.equal(page.document.listenerCount(), 0);
});

test('touch and wheel retain native page scrolling without changing the view', () => {
    const page = fixture();
    const initial = page.camera.position.clone();
    const touch = page.element.emit('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 20, clientY: 30 });
    const wheel = page.element.emit('wheel', { deltaY: 100 });
    assert.equal(touch.prevented, false);
    assert.equal(wheel.prevented, false);
    assert.equal(page.element.captures, 0);
    assert.equal(page.element.style.touchAction, 'pan-y pinch-zoom');
    assert.equal(page.element.getAttribute('aria-describedby'), undefined);
    assert.equal(page.camera.position.distanceTo(initial), 0);
    page.controls.dispose();
});

test('keyboard can rotate through a full orbit and Home restores the original view', () => {
    const page = fixture(true);
    const initial = page.camera.position.clone();
    let unwrappedAngle = 0;
    let previous = Math.atan2(initial.x, initial.z);
    for (let step = 0; step < 40; step++) {
        const event = page.element.emit('keydown', { key: 'ArrowLeft' });
        assert.equal(event.prevented, true);
        const angle = Math.atan2(page.camera.position.x, page.camera.position.z);
        unwrappedAngle += Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
        previous = angle;
    }
    assert.ok(Math.abs(unwrappedAngle) > Math.PI * 2);
    page.element.emit('keydown', { key: 'Home' });
    assert.ok(page.camera.position.distanceTo(initial) < 1e-10);
    page.controls.dispose();
});

test('vertical rotation stays above ground and unrelated or disabled keys do nothing', () => {
    const page = fixture(true);
    for (let step = 0; step < 40; step++) page.element.emit('keydown', { key: 'ArrowDown' });
    assert.ok(page.camera.position.y > 0.93);
    const chosen = page.camera.position.clone();
    assert.equal(page.element.emit('keydown', { key: 'Tab' }).prevented, false);
    assert.equal(page.element.emit('keydown', { key: 'ArrowLeft', ctrlKey: true }).prevented, false);
    page.controls.setEnabled(false);
    assert.equal(page.element.emit('keydown', { key: 'ArrowLeft' }).prevented, false);
    assert.equal(page.camera.position.distanceTo(chosen), 0);
    page.controls.dispose();
});

test('Home cancels pending rotation inertia before restoring the view', () => {
    const page = fixture();
    const initial = page.camera.position.clone();
    page.element.emit('keydown', { key: 'ArrowLeft' });
    assert.ok(page.camera.position.distanceTo(initial) > 0);
    page.element.emit('keydown', { key: 'Home' });
    page.settle();
    assert.ok(page.camera.position.distanceTo(initial) < 1e-10);
    page.controls.dispose();
});

test('suspending orbit for the crank freezes the camera and clears momentum', () => {
    const page = fixture();
    page.element.emit('keydown', { key: 'ArrowLeft' });
    const chosen = page.camera.position.clone();
    page.controls.setEnabled(false);
    for (let frame = 0; frame < 30; frame++) page.controls.update();
    assert.ok(page.camera.position.distanceTo(chosen) < 1e-10);
    page.controls.setEnabled(true);
    page.settle();
    assert.ok(page.camera.position.distanceTo(chosen) < 1e-10);
    page.controls.dispose();
});
