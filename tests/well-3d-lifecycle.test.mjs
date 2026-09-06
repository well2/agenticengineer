import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { getWellLayout, sampleWellTransition, WELL_VIEW } from '../js/well-layout.mjs';
import { createWaterState, startPour, stepWater } from '../js/well-water-state.mjs';
import { createWellDelivery } from '../js/well-delivery.js';

const source = readFileSync(new URL('../js/well-3d.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
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

async function createPage(options = {}) {
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
    runInNewContext(source, {
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
    await new Promise(setImmediate);
    return {
        stats, frames, observers, bounds, figure, toggle, layers, canvas, motion, document, window, delivery, deliveryValues, stages,
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

function assertCleanedUp(page) {
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

test('successful initialization draws once and unload cancels a pending interaction frame', async () => {
    const page = await createPage({ lang: 'en' });
    assert.equal(page.frames.size, 1);
    assert.equal(page.ready(), false);
    page.flush();
    assert.equal(page.stats.renderCalls, 1);
    assert.equal(page.ready(), true);
    assert.equal(page.toggle.hidden, false);
    assert.equal(page.toggle.textContent, 'Lower the bucket');
    page.toggle.emit('click');
    assert.equal(page.frames.size, 1);
    page.window.emit('pagehide', { persisted: false });
    assertCleanedUp(page);
    page.window.emit('pagehide', { persisted: false });
    assertCleanedUp(page);
});

test('unavailable WebGL keeps the static illustration without renderer callbacks', async () => {
    const page = await createPage({ noWebGL: true });
    assert.equal(page.ready(), false);
    assert.equal(page.toggle.hidden, true);
    assert.equal(page.canvas.attached, false);
    assert.equal(page.listenerCount(), 0);
    assert.equal(page.frames.size, 0);
    assert.equal(page.observers.length, 0);
    assert.equal(page.stats.renderCalls, 0);
    assert.equal(page.stats.rendererDisposals, 0);
});

test('a failed first render removes every callback and safely ignores stale resize delivery', async () => {
    const page = await createPage({ renderThrows: true });
    assert.doesNotThrow(() => page.flush());
    assertCleanedUp(page);
    page.observers[0].callback();
    page.figure.emit('pointermove', { clientX: 20, clientY: 20 });
    page.document.emit('visibilitychange');
    page.toggle.emit('click');
    page.flush();
    assert.equal(page.stats.renderCalls, 1);
    assertCleanedUp(page);
});

test('a sizing failure during partial initialization uses the same idempotent cleanup', async () => {
    const page = await createPage({ sizeThrows: true });
    assert.equal(page.stats.renderCalls, 0);
    assertCleanedUp(page);
    page.observers[0].callback();
    page.window.emit('pagehide', { persisted: false });
    assertCleanedUp(page);
});

test('context loss shows the fallback until restoration produces a successful frame', async () => {
    const page = await createPage({ reducedMotion: true });
    page.flush();
    page.toggle.emit('click');
    page.flush();
    assert.equal(page.layers.hidden, false);
    let prevented = false;
    page.canvas.emit('webglcontextlost', { preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(page.ready(), false);
    assert.equal(page.toggle.hidden, true);
    assert.equal(page.layers.hidden, true);
    assert.equal(page.expanded(), false);
    assert.equal(page.frames.size, 0);
    page.observers[0].callback();
    assert.equal(page.frames.size, 0);
    page.canvas.emit('webglcontextrestored');
    assert.equal(page.ready(), false);
    assert.equal(page.layers.hidden, true);
    assert.equal(page.frames.size, 1);
    page.flush();
    assert.equal(page.ready(), true);
    assert.equal(page.layers.hidden, false);
    assert.equal(page.expanded(), true);
    assert.equal(page.stats.rendererDisposals, 0);
    page.window.emit('pagehide', { persisted: false });
    assertCleanedUp(page);
});

test('zero-sized layout waits for measurable space before drawing or hiding the fallback', async () => {
    const page = await createPage({ width: 0, height: 0 });
    assert.equal(page.frames.size, 0);
    assert.equal(page.ready(), false);
    assert.equal(page.toggle.hidden, true);
    page.bounds.width = 350;
    page.bounds.height = 400;
    page.observers[0].callback();
    assert.equal(page.frames.size, 1);
    page.flush();
    assert.equal(page.ready(), true);
    assert.equal(page.stats.renderCalls, 1);
    page.window.emit('pagehide', { persisted: false });
    assertCleanedUp(page);
});

test('a later interaction render failure also removes callbacks and returns to the fallback', async () => {
    const options = {};
    const page = await createPage(options);
    page.flush();
    options.renderThrows = true;
    page.toggle.emit('click');
    assert.doesNotThrow(() => page.flush());
    assert.equal(page.stats.renderCalls, 2);
    assertCleanedUp(page);
});

test('layer links appear after successful expansion and hide immediately on collapse', async () => {
    const page = await createPage({ reducedMotion: true });
    page.flush();
    assert.equal(page.layers.hidden, true);
    assert.equal(page.expanded(), false);
    page.toggle.emit('click');
    assert.equal(page.layers.hidden, true);
    page.flush();
    assert.equal(page.layers.hidden, false);
    assert.equal(page.expanded(), true);
    assert.equal(page.toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(page.frames.size, 0);
    page.toggle.emit('click');
    page.flush();
    assert.equal(page.layers.hidden, true);
    assert.equal(page.expanded(), false);
    assert.equal(page.toggle.getAttribute('aria-expanded'), 'false');
    page.flush();
    assert.equal(page.frames.size, 0);
    page.window.emit('pagehide', { persisted: false });
    assertCleanedUp(page);
});

test('the optional layer list can be absent without breaking model controls', async () => {
    const page = await createPage({ noLayers: true, reducedMotion: true });
    page.flush();
    page.toggle.emit('click');
    page.flush();
    assert.equal(page.ready(), true);
    assert.equal(page.expanded(), true);
    assert.equal(page.toggle.textContent, 'Vytáhnout kýbl');
    page.window.emit('pagehide', { persisted: false });
    assertCleanedUp(page);
});

test('render failure hides links that were already visible on an expanded model', async () => {
    const options = { reducedMotion: true };
    const page = await createPage(options);
    page.flush();
    page.toggle.emit('click');
    page.flush();
    assert.equal(page.layers.hidden, false);
    options.renderThrows = true;
    page.observers[0].callback();
    assert.doesNotThrow(() => page.flush());
    assertCleanedUp(page);
});

test('vertical input lowers the initially raised bucket and stops rendering at rest', async () => {
    const page = await createPage();
    page.flush();
    const initial = page.layout().bucket;
    page.raise(0.75);
    assert.equal(page.frames.size, 1);
    page.flush();
    assert.ok(page.layout().bucket < initial);
    assert.equal(page.layout().crankAngle, Math.PI * 3);
    assert.equal(page.frames.size, 0);
    page.window.emit('pagehide');
    assertCleanedUp(page);
});

test('the action button cancels dragging and raises the bucket while assembling the model', async () => {
    const page = await createPage({ reducedMotion: true });
    page.flush();
    page.raise(0.5);
    page.flush();
    page.toggle.emit('click');
    assert.equal(page.hoist.cancelled, 1);
    page.flush();
    assert.equal(page.layout().crankAngle, Math.PI * 4);
    assert.equal(page.hoist.enabled, true);
    assert.equal(page.frames.size, 0);
});

test('context loss disables cranking and a render error disposes it', async () => {
    const options = {};
    const page = await createPage(options);
    page.flush();
    page.canvas.emit('webglcontextlost', { preventDefault() {} });
    assert.equal(page.hoist.enabled, false);
    page.canvas.emit('webglcontextrestored');
    page.flush();
    assert.equal(page.hoist.enabled, true);
    options.renderThrows = true;
    page.raise(0.5);
    page.flush();
    assertCleanedUp(page);
});

test('the full water cycle starts empty, fills below, retains water above and pours empty', async () => {
    const page = await createPage();
    page.flush();
    assert.equal(page.water().fill, 0);
    assert.equal(page.expanded(), false);
    assert.equal(page.pourControl.available, false);
    page.pour();
    assert.equal(page.frames.size, 0);
    page.raise(0);
    page.pump();
    assert.equal(page.water().fill, 1);
    assert.equal(page.expanded(), true);
    assert.equal(page.frames.size, 0);
    page.raise(1);
    page.flush();
    assert.equal(page.water().fill, 1);
    assert.equal(page.expanded(), false);
    assert.equal(page.pourControl.available, true);
    page.pour();
    page.flush();
    assert.equal(page.hoist.enabled, false);
    assert.equal(page.toggle.disabled, true);
    page.raise(0);
    page.pump();
    assert.equal(page.layout().crankAngle, Math.PI * 4);
    assert.equal(page.water().fill, 0);
    assert.equal(page.hoist.enabled, true);
    assert.equal(page.pourControl.available, false);
    assert.equal(page.frames.size, 0);
    page.window.emit('pagehide');
    assertCleanedUp(page);
});

test('an interrupted descent retraces the masonry while bucket movement stays monotonic', async () => {
    const page = await createPage();
    page.flush();
    const top = page.layout();
    page.raise(0.5);
    page.flush();
    const middle = page.layout();
    page.raise(0.1);
    page.flush();
    const bottom = page.layout();
    assert.ok(top.bucket > middle.bucket && middle.bucket > bottom.bucket);
    assert.ok(top.courses[3] < middle.courses[3] && middle.courses[3] < bottom.courses[3]);
    page.raise(0.5);
    page.flush();
    assert.deepEqual(page.layout(), middle);
    page.window.emit('pagehide');
    assertCleanedUp(page);
});

test('stage callouts receive every intermediate layout in both directions', async () => {
    const page = await createPage();
    page.flush();
    for (const lift of [0.9, 0.6, 0.2, 0.6, 0.9, 1]) {
        page.raise(lift);
        page.flush();
        const stage = page.stages.updateCalls.at(-1);
        assert.equal(stage.expansion, 1 - lift);
        assert.equal(stage.layout, page.layout());
        assert.equal(stage.reduced, false);
    }
    assert.equal(page.layers.hidden, true);
    assert.equal(page.frames.size, 0);
});

test('a completed pour delivers software, stays idle and resets on the next descent', async () => {
    const page = await createPage();
    page.flush();
    page.pour();
    assert.equal(page.delivery.hidden, true);
    page.raise(0); page.pump();
    page.raise(1); page.flush();
    page.pour(); page.pump(120);
    assert.equal(page.delivery.hidden, false);
    assert.equal(page.deliveryValues.get('aria-hidden'), 'true');
    assert.equal(page.transformation().progress, page.water().pourProgress);
    assert.equal(page.transformation().delivered, true);
    assert.equal(page.transformation().reduced, false);
    assert.deepEqual(page.stats.drawOrder, ['controls', 'transform', 'render', 'project']);
    assert.equal(page.projection().camera, page.transformation().camera);
    assert.equal(page.projection().width, page.bounds.width);
    assert.equal(page.projection().height, page.bounds.height);
    assert.equal(page.deliveryValues.get('--creation-x'), `${page.bounds.width / 2}px`);
    assert.equal(page.deliveryValues.get('--creation-y'), '60px');
    page.pump();
    assert.equal(page.delivery.dataset.complete, 'true');
    assert.equal(page.deliveryValues.get('aria-hidden'), 'false');
    assert.equal(page.frames.size, 0);
    assert.equal(page.transformation().progress, null);
    assert.equal(page.transformation().delivered, true);
    page.raise(0.5); page.flush();
    assert.equal(page.delivery.hidden, true);
    assert.equal(page.transformation().delivered, false);
});

test('context loss hides delivered software and restores it after a successful draw', async () => {
    const page = await createPage({ reducedMotion: true });
    page.flush(); page.raise(0); page.flush(); page.raise(1); page.flush();
    page.pour(); page.flush();
    assert.equal(page.delivery.dataset.complete, 'true');
    assert.equal(page.transformation().reduced, true);
    page.canvas.emit('webglcontextlost', { preventDefault() {} });
    assert.equal(page.delivery.hidden, true);
    page.canvas.emit('webglcontextrestored'); page.flush();
    assert.equal(page.delivery.hidden, false);
    assert.equal(page.transformation().progress, null);
    assert.equal(page.transformation().delivered, true);
    page.window.emit('pagehide');
    assertCleanedUp(page);
});

for (const failure of ['transformationThrows', 'projectionThrows']) {
    test(`${failure} hides an assembled window and disposes the entire scene`, async () => {
        const options = { reducedMotion: true };
        const page = await createPage(options);
        page.flush(); page.raise(0); page.flush(); page.raise(1); page.flush();
        page.pour(); page.flush();
        assert.equal(page.delivery.hidden, false);
        options[failure] = true;
        page.observers[0].callback();
        assert.doesNotThrow(() => page.flush());
        assertCleanedUp(page);
    });
}
