import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { getWellLayout, sampleWellTransition, WELL_VIEW } from '../../js/well-layout.mjs';
import { createWaterState, startPour, stepWater } from '../../js/well-water-state.mjs';
import { createWellDelivery } from '../../js/well-delivery.js';

const source = readFileSync(new URL('../../js/well-3d.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export async function initialize', 'async function initialize')
    .replace("import('../vendor/three/three.module.min.js')", 'Promise.resolve(testTHREE)')
    .replace("import('./well-scene.js')", 'Promise.resolve({ createWellScene: testCreateWellScene })')
    .replace("import('./well-controls.js')", 'Promise.resolve({ createWellControls: testCreateWellControls })')
    .replace("import('./well-hoist.js')", 'Promise.resolve({ createWellHoist: testCreateWellHoist })')
    .replace("import('./well-bucket-control.js')", 'Promise.resolve({ createBucketPourControl: testCreateBucketPourControl })')
    .replace("import('./well-stages.js')", 'Promise.resolve({ createWellStages: testCreateWellStages })');

function eventTarget() {
    const handlers = new Map();
    return {
        addEventListener(name, handler) {
            if (!handlers.has(name)) handlers.set(name, new Set());
            handlers.get(name).add(handler);
        },
        removeEventListener(name, handler) { handlers.get(name)?.delete(handler); },
        emit(name, event = {}) { [...(handlers.get(name) ?? [])].forEach((handler) => handler(event)); },
        listenerCount() { return [...handlers.values()].reduce((count, items) => count + items.size, 0); },
    };
}

export async function createPage(options = {}) {
    const stats = { renderCalls: 0, rendererDisposals: 0, modelDisposals: 0, callsAfterDispose: 0, drawOrder: [] };
    const frames = new Map();
    const observers = [];
    const classes = new Set();
    const bounds = { left: 0, top: 0, width: options.width ?? 460, height: options.height ?? 500 };
    let nextFrame = 1;
    let time = 0;
    let hoistCallbacks;
    let pourCallbacks;
    let latestWater, latestLayout, transformation, projection;
    const pourControl = { disposed: 0, enabled: true, available: false,
        update(value) { this.available = value; }, setEnabled(value) { this.enabled = value; },
        cancel() {}, dispose() { this.disposed++; },
    };
    const hoist = { enabled: true, cancelled: 0, disposed: 0, update() {},
        setEnabled(value) { this.enabled = value; },
        cancel() { this.cancelled++; },
        dispose() { this.disposed++; },
    };
    const figure = {
        ...eventTarget(), getBoundingClientRect: () => bounds,
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    };
    const attributes = new Map();
    const toggle = {
        ...eventTarget(), hidden: true, dataset: {}, textContent: '',
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: (name) => attributes.get(name),
    };
    const layers = options.noLayers ? null : { hidden: true };
    const deliveryValues = new Map();
    const delivery = { hidden: true, dataset: {},
        setAttribute: (name, value) => deliveryValues.set(name, value),
        style: { setProperty: (name, value) => deliveryValues.set(name, value) },
    };
    const stages = { updateCalls: [], hidden: true,
        update(layout, expansion, reduced) { this.updateCalls.push({ layout, expansion, reduced }); this.hidden = expansion <= 0.06; },
        hide() { this.hidden = true; }, dispose() { this.hidden = true; },
    };
    const canvas = {
        ...eventTarget(), attached: false,
        getContext: () => options.noWebGL ? null : {},
        setAttribute() {}, remove() { this.attached = false; },
    };
    const mount = {
        closest: () => figure,
        getBoundingClientRect: () => bounds,
        appendChild(child) { child.attached = true; },
    };
    const motion = { ...eventTarget(), matches: options.reducedMotion ?? false };
    const document = {
        ...eventTarget(), hidden: false, documentElement: { lang: options.lang ?? 'cs' },
        getElementById: (id) => ({ wellModel: mount, wellToggle: toggle, wellLayers: layers, wellDelivery: delivery })[id] ?? null,
        createElement: () => canvas,
    };
    const window = { ...eventTarget(), matchMedia: () => motion, devicePixelRatio: 2 };
    const THREE = {
        WebGLRenderer: class {
            shadowMap = {};
            disposed = false;
            setPixelRatio() {}
            setClearColor() {}
            setSize() {
                if (this.disposed) stats.callsAfterDispose++;
                if (options.sizeThrows) throw new Error('Canvas sizing failed');
            }
            render() {
                stats.drawOrder.push('render');
                if (this.disposed) stats.callsAfterDispose++;
                stats.renderCalls++;
                if (options.renderThrows) throw new Error('GPU draw failed');
            }
            dispose() { this.disposed = true; stats.rendererDisposals++; }
        },
        OrthographicCamera: class {
            position = { set() {} };
            lookAt() {}
            updateProjectionMatrix() {}
        },
        PCFShadowMap: 1, ACESFilmicToneMapping: 2,
    };
    const model = {
        scene: {}, sculpture: { rotation: { set() {} } },
        update(layout, water) { latestLayout = layout; latestWater = water; stats.drawOrder = []; },
        updateTransformation(progress, delivered, camera, reduced) {
            stats.drawOrder.push('transform');
            if (options.transformationThrows) throw new Error('Particle update failed');
            transformation = { progress, delivered, camera, reduced };
        },
        projectDelivery(camera, width, height) {
            stats.drawOrder.push('project');
            if (options.projectionThrows) throw new Error('Delivery projection failed');
            projection = { camera, width, height };
            return { x: bounds.width / 2, y: 60 };
        },
        dispose() { stats.modelDisposals++; },
    };
    const initialize = runInNewContext(`${source}\ninitialize;`, {
        document, window, navigator: {}, testTHREE: THREE, getWellLayout, sampleWellTransition, WELL_VIEW, createWaterState, startPour, stepWater,
        createWellDelivery, testCreateWellStages: () => stages,
        testCreateWellScene: () => model,
        testCreateWellControls: () => ({
            update() { stats.drawOrder.push('controls'); return false; }, dispose() {}, syncMotion() {}, setEnabled() {},
        }),
        testCreateWellHoist: (_model, _camera, _mount, callbacks) => { hoistCallbacks = callbacks; return hoist; },
        testCreateBucketPourControl: (_model, _camera, _mount, callbacks) => { pourCallbacks = callbacks; return pourControl; },
        ResizeObserver: class {
            disconnected = false;
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe() {}
            disconnect() { this.disconnected = true; }
        },
        requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
        cancelAnimationFrame(id) { frames.delete(id); },
    });
    const callbacks = { onReady: () => stats.readyCalls++, onError: () => stats.errors++ };
    stats.readyCalls = 0;
    stats.errors = 0;
    if (options.autoInitialize !== false) await initialize(callbacks);
    await new Promise(setImmediate);
    return {
        stats, frames, observers, bounds, figure, toggle, layers, canvas, motion, document, window, delivery, deliveryValues, stages,
        initialize: () => initialize(callbacks),
        pourControl, pour: () => pourCallbacks.onPour(), water: () => latestWater,
        pump(count = 240) { for (let i = 0; i < count; i++) this.flush(); },
        transformation: () => transformation, projection: () => projection,
        hoist, raise: (value) => hoistCallbacks.onChange(value), layout: () => latestLayout,
        ready: () => classes.has('is-3d-ready'),
        expanded: () => classes.has('is-expanded'),
        listenerCount: () => [figure, toggle, canvas, motion, document].reduce((count, target) => count + target.listenerCount(), 0),
        flush() {
            const batch = [...frames.values()];
            frames.clear();
            time += 16;
            batch.forEach((callback) => callback(time));
        },
    };
}

export function assertCleanedUp(page) {
    assert.deepEqual([page.ready(), page.expanded(), page.canvas.attached], [false, false, false]);
    if (page.layers) {
        assert.equal(page.layers.hidden, true);
        assert.equal(page.toggle.getAttribute('aria-expanded'), 'false');
    }
    assert.deepEqual([page.toggle.hidden, page.delivery.hidden, page.stages.hidden], [true, true, true]);
    assert.deepEqual([page.listenerCount(), page.frames.size, page.stats.callsAfterDispose], [0, 0, 0]);
    assert.ok(page.observers.every((observer) => observer.disconnected));
    assert.deepEqual([page.stats.rendererDisposals, page.stats.modelDisposals, page.hoist.disposed, page.pourControl.disposed], [1, 1, 1, 1]);
}

