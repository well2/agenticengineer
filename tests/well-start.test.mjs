import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/well-start.js', import.meta.url), 'utf8')
    .replace(/import\(['"]\.\/well-3d\.js(?:\?[^'"]*)?['"]\)/, 'loadModel()');

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
    const mount = {
        focus() { stats.focusCalls++; },
        setAttribute: (name, value) => attributes.set(name, value),
    };
    const window = eventTarget();
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
        assert.match(page.status.textContent, lang === 'cs' ? /Kovárnu si můžete prohlédnout níže/ : /explore the workshop below/);
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
    page.failModel();
    assert.match(page.status.textContent, /could not load/);
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
