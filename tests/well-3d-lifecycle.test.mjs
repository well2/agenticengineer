import assert from 'node:assert/strict';
import test from 'node:test';
import { createPage, assertCleanedUp } from './helpers/well-lifecycle.mjs';

test('importing the model stays dormant until explicit initialization and readiness follows a draw', async () => {
    const page = await createPage({ autoInitialize: false });
    assert.equal(page.frames.size, 0);
    assert.equal(page.observers.length, 0);
    assert.equal(page.stats.renderCalls, 0);
    await page.initialize();
    await page.initialize();
    assert.equal(page.observers.length, 1);
    assert.equal(page.stats.readyCalls, 0);
    page.flush();
    assert.equal(page.stats.readyCalls, 1);
    page.observers[0].callback();
    page.flush();
    assert.equal(page.stats.readyCalls, 1);
    assert.equal(page.stats.errors, 0);
});

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
    assert.equal(page.stats.readyCalls, 0);
    assert.equal(page.stats.errors, 1);
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
    assert.equal(page.stats.readyCalls, 0);
    assert.equal(page.stats.errors, 1);
    assertCleanedUp(page);
});

test('a sizing failure during partial initialization uses the same idempotent cleanup', async () => {
    const page = await createPage({ sizeThrows: true });
    assert.equal(page.stats.renderCalls, 0);
    assert.equal(page.stats.errors, 1);
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
    assert.ok(top.courses.at(-1) < middle.courses.at(-1) && middle.courses.at(-1) < bottom.courses.at(-1));
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
