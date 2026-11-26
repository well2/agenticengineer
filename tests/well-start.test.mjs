import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/well-start.js', import.meta.url), 'utf8')
    .replace(/import\(['"]\.\/well-3d\.js(?:\?[^'"]*)?['"]\)/, 'loadModel()')
    .replaceAll('import.meta.resolve', 'resolveModule');

function eventTarget() {
    const handlers = new Map();
    return {
        addEventListener(name, handler) { handlers.set(name, handler); },
        emit(name, event = {}) { return handlers.get(name)?.(event); },
    };
}

function createPage(options = {}) {
    const attributes = new Map();
    const frames = new Map();
    const status = { textContent: '' };
    const stats = { imports: 0, initializations: 0, focusCalls: 0 };
    const classes = new Set();
    const figure = { classList: { add: (name) => classes.add(name) } };
    const mount = {
        focus() { stats.focusCalls++; },
        setAttribute: (name, value) => attributes.set(name, value),
        closest: (selector) => (selector === '.hero-well' && !options.noFigure ? figure : null),
    };
    const window = eventTarget();
    if (options.webgl2) window.WebGL2RenderingContext = class {};
    const preloads = [];
    let callbacks;
    let nextFrame = 1;
    let resolveModule, rejectModule;
    const module = new Promise((resolve, reject) => { resolveModule = resolve; rejectModule = reject; });
    runInNewContext(source, {
        document: {
            documentElement: { lang: options.lang ?? 'cs' },
            getElementById: (id) => ({
                wellModel: options.noMount ? null : mount,
                wellLoadStatus: options.noStatus ? null : status,
            })[id] ?? null,
            createElement: (name) => ({ name }),
            head: { append: (link) => preloads.push(link) },
        },
        resolveModule(specifier) {
            if (options.resolveThrows) throw new Error('Unresolvable');
            return `https://example.test${specifier.replace('..', '')}?v=mapped`;
        },
        navigator: { connection: { saveData: options.saveData ?? false } },
        window,
        requestAnimationFrame(callback) {
            const id = nextFrame++;
            frames.set(id, callback);
            return id;
        },
        cancelAnimationFrame(id) { frames.delete(id); },
        loadModel() { stats.imports++; return module; },
    });
    return {
        status, stats, attributes, window, frames,
        isStatic: () => classes.has('is-static'),
        preloads,
        async paint() {
            const batch = [...frames.values()];
            frames.clear();
            await Promise.all(batch.map((callback) => callback()));
        },
        startLoading() { this.paint(); return this.paint(); },
        failImport: () => rejectModule(new Error('Import unavailable')),
        resolveImport() {
            resolveModule({
                initialize(value) {
                    stats.initializations++;
                    callbacks = value;
                    if (options.initializeThrows) throw new Error('Initialization failed');
                },
            });
        },
        draw: () => callbacks.onReady(),
        failModel: () => callbacks.onError(),
    };
}

test('3D loads automatically after the first paint and never takes keyboard focus', async () => {
    const page = createPage({ lang: 'en' });
    assert.equal(page.stats.imports, 0);
    await page.paint();
    assert.equal(page.stats.imports, 0);
    const loading = page.paint();
    assert.equal(page.stats.imports, 1);
    assert.equal(page.attributes.get('aria-busy'), 'true');
    assert.match(page.status.textContent, /Loading/);
    page.resolveImport();
    await loading;
    assert.equal(page.stats.initializations, 1);
    assert.match(page.status.textContent, /Loading/);
    page.draw();
    assert.equal(page.attributes.get('aria-busy'), 'false');
    assert.equal(page.status.textContent, '');
    assert.equal(page.isStatic(), false);
    assert.equal(page.stats.focusCalls, 0);
    page.draw();
    assert.equal(page.stats.focusCalls, 0);
});

test('repeated pageshow events do not duplicate scheduling, imports or initialization', async () => {
    const page = createPage();
    page.window.emit('pageshow');
    page.window.emit('pageshow');
    assert.equal(page.frames.size, 1);
    const loading = page.startLoading();
    page.window.emit('pageshow');
    assert.equal(page.stats.imports, 1);
    page.resolveImport();
    await loading;
    page.window.emit('pageshow');
    assert.equal(page.stats.initializations, 1);
    assert.equal(page.frames.size, 0);
});

test('failed imports announce a localized text alternative without mentioning an image', async () => {
    for (const lang of ['cs', 'en']) {
        const page = createPage({ lang });
        const loading = page.startLoading();
        page.failImport();
        await loading;
        assert.match(page.status.textContent, lang === 'cs' ? /Forge si můžete prohlédnout níže/ : /explore Forge below/);
        assert.equal(page.attributes.get('aria-busy'), 'false');
        assert.equal(page.stats.focusCalls, 0);
        assert.equal(page.stats.initializations, 0);
    }
});

test('a model failure before its first frame clears busy state and announces the error', async () => {
    const page = createPage({ lang: 'en' });
    const loading = page.startLoading();
    page.resolveImport();
    await loading;
    assert.equal(page.isStatic(), false);
    page.failModel();
    assert.match(page.status.textContent, /could not load/);
    assert.equal(page.isStatic(), true);
    assert.equal(page.attributes.get('aria-busy'), 'false');
    assert.equal(page.stats.focusCalls, 0);
});

test('an initialization exception is handled like an import failure', async () => {
    const page = createPage({ initializeThrows: true });
    const loading = page.startLoading();
    page.resolveImport();
    await loading;
    assert.match(page.status.textContent, /nepodařilo/);
    assert.equal(page.attributes.get('aria-busy'), 'false');
});

test('Data Saver suppresses heavy downloads and supplies a localized textual explanation', async () => {
    for (const lang of ['cs', 'en']) {
        const page = createPage({ saveData: true, lang });
        page.window.emit('pageshow');
        await page.paint();
        assert.equal(page.frames.size, 0);
        assert.equal(page.stats.imports, 0);
        assert.match(page.status.textContent, lang === 'cs' ? /úspora dat/ : /Data Saver/);
        assert.equal(page.isStatic(), true);
    }
});

test('an absent model does not schedule work and an optional status can be omitted', async () => {
    const absent = createPage({ noMount: true });
    assert.equal(absent.frames.size, 0);
    const page = createPage({ noStatus: true });
    const loading = page.startLoading();
    page.resolveImport();
    await loading;
    assert.doesNotThrow(() => page.draw());
    assert.equal(page.attributes.get('aria-busy'), 'false');
});

test('non-persisted pagehide cancels scheduled work and cannot be revived by pageshow', async () => {
    const page = createPage();
    await page.paint();
    page.window.emit('pagehide', { persisted: false });
    page.window.emit('pageshow');
    await page.paint();
    assert.equal(page.frames.size, 0);
    assert.equal(page.stats.imports, 0);
});

test('a late import after non-persisted pagehide never starts rendering', async () => {
    const page = createPage();
    const loading = page.startLoading();
    page.window.emit('pagehide', { persisted: false });
    page.resolveImport();
    await loading;
    page.window.emit('pageshow');
    assert.equal(page.stats.initializations, 0);
    assert.equal(page.stats.focusCalls, 0);
});

test('bfcache restoration reschedules an unstarted load without duplicating frames', async () => {
    const page = createPage();
    page.window.emit('pagehide', { persisted: true });
    assert.equal(page.frames.size, 0);
    page.window.emit('pageshow', { persisted: true });
    const loading = page.startLoading();
    page.resolveImport();
    await loading;
    assert.equal(page.stats.imports, 1);
    assert.equal(page.stats.initializations, 1);
});

test('an imported module waits for bfcache restoration before initialization', async () => {
    const page = createPage();
    const loading = page.startLoading();
    page.window.emit('pagehide', { persisted: true });
    page.resolveImport();
    await loading;
    assert.equal(page.stats.initializations, 0);
    page.window.emit('pageshow', { persisted: true });
    assert.equal(page.stats.initializations, 1);
    page.draw();
    assert.equal(page.stats.focusCalls, 0);
});

test('starting the model preloads both Three.js modules through the import map, once', async () => {
    const page = createPage({ webgl2: true });
    assert.equal(page.preloads.length, 0);
    const loading = page.startLoading();
    assert.deepEqual(page.preloads.map((link) => [link.name, link.rel, link.href]), [
        ['link', 'modulepreload', 'https://example.test/vendor/three/three.module.min.js?v=mapped'],
        ['link', 'modulepreload', 'https://example.test/vendor/three/three.core.min.js?v=mapped'],
    ]);
    page.window.emit('pageshow');
    page.resolveImport();
    await loading;
    assert.equal(page.preloads.length, 2);
});

test('without WebGL 2 nothing is preloaded, and a preload failure never blocks the model', async () => {
    const unsupported = createPage();
    const pending = unsupported.startLoading();
    assert.equal(unsupported.preloads.length, 0);
    unsupported.resolveImport();
    await pending;
    const page = createPage({ webgl2: true, resolveThrows: true });
    const loading = page.startLoading();
    page.resolveImport();
    await loading;
    assert.deepEqual([page.preloads.length, page.stats.imports, page.stats.initializations], [0, 1, 1]);
});
