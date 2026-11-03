import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hashAsset, HTML_PAGES, readAssetVersions, syncAssets, transformHtml } from '../tools/sync-assets.mjs';

const versions = new Map([
    ['/js/main.js', hashAsset('main')],
    ['/js/start.js', hashAsset('start')],
    ['/js/layout.mjs', hashAsset('layout')],
    ['/css/site.css', hashAsset('style')],
    ['/vendor/three/three.module.min.js', hashAsset('three')],
    ['/vendor/three/three.core.min.js', hashAsset('core')],
    ['/vendor/three/OrbitControls.min.js', hashAsset('controls')],
]);
const page = '<!doctype html>\n<html>\n<head>\n  <link rel="stylesheet" href="/css/site.css">\n'
    + '  <script type="application/ld+json">{"name":"Unchanged"}</script>\n</head>\n<body>\n'
    + '  <script src="/js/main.js" defer></script>\n  <script type="module" src="/js/start.js"></script>\n</body>\n</html>\n';

function importMap(html) {
    return JSON.parse(html.match(/<script type="importmap" id="asset-importmap">([\s\S]*?)<\/script>/)[1]).imports;
}

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'agentic-assets-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await Promise.all(['js', 'css', 'vendor/three', 'en', 'tools'].map((directory) => mkdir(join(root, directory), { recursive: true })));
    await Promise.all([...versions].map(([path]) => writeFile(join(root, path.slice(1)), `Contents of ${path}`)));
    await writeFile(join(root, 'vendor/three/LICENSE'), 'Do not version this document.');
    for (const name of HTML_PAGES) await writeFile(join(root, name), name === '404.html' ? page.replace(/  <script[^\n]*\n/g, '') : page);
    return root;
}

test('asset hashes are deterministic, content-sensitive and reject unsupported inputs', () => {
    assert.equal(hashAsset('abc'), 'ba7816bf8f01');
    assert.equal(hashAsset(Buffer.from('abc')), hashAsset('abc'));
    assert.equal(hashAsset(''), 'e3b0c44298fc');
    assert.notEqual(hashAsset('abc\n'), hashAsset('abc'));
    for (const input of [null, undefined, 12, {}]) assert.throws(() => hashAsset(input), TypeError);
});

test('all local styles and entry scripts are versioned and the complete module map precedes execution', () => {
    const result = transformHtml(page, versions);
    assert.ok(result.includes(`/css/site.css?v=${versions.get('/css/site.css')}`));
    assert.ok(result.includes(`/js/main.js?v=${versions.get('/js/main.js')}`));
    assert.ok(result.includes(`/js/start.js?v=${versions.get('/js/start.js')}`));
    assert.ok(result.indexOf('id="asset-importmap"') < result.indexOf('type="application/ld+json"'));
    assert.ok(result.indexOf('id="asset-importmap"') < result.indexOf('type="module"'));
    assert.ok(result.includes('<script type="application/ld+json">{"name":"Unchanged"}</script>'));
    const imports = importMap(result);
    assert.equal(Object.keys(imports).length, 6);
    for (const [path, hash] of versions) {
        if (!path.startsWith('/css/')) assert.equal(imports[path], `${path}?v=${hash}`);
    }
    assert.equal(transformHtml(result, versions), result);
});

test('nested pages preserve relative paths, unrelated parameters, fragments and external assets', () => {
    const html = '<head><link rel="stylesheet" href="../css/site.css?mode=print&amp;v=old#rules">'
        + '<link rel="stylesheet" href="https://cdn.example/site.css"><link rel="preload" href="/css/site.css"></head>'
        + '<script type="module" src="../js/start.js?v=old"></script><script src="https://cdn.example/a.js"></script>';
    const result = transformHtml(html, versions, 'en/index.html');
    assert.ok(result.includes(`../css/site.css?mode=print&amp;v=${versions.get('/css/site.css')}#rules`));
    assert.ok(result.includes(`../js/start.js?v=${versions.get('/js/start.js')}`));
    assert.ok(result.includes('<link rel="stylesheet" href="https://cdn.example/site.css">'));
    assert.ok(result.includes('<link rel="preload" href="/css/site.css">'));
    assert.ok(result.includes('<script src="https://cdn.example/a.js"></script>'));
    assert.equal(transformHtml(result, versions, 'en/index.html'), result);
});

test('inline modules receive a map and vendor imports resolve to one versioned Three.js identity', () => {
    const result = transformHtml('<head>\n</head>\n<script type="module">import "/js/start.js";</script>', versions);
    const imports = importMap(result);
    const base = 'https://example.com/js/start.js?v=entry';
    const direct = new URL('../vendor/three/three.module.min.js', base).pathname;
    const controls = new URL('./three.module.min.js', 'https://example.com/vendor/three/OrbitControls.min.js?v=controls').pathname;
    assert.equal(imports[direct], imports[controls]);
    const core = new URL('./three.core.min.js', `https://example.com${imports[direct]}`).pathname;
    assert.equal(imports[core], `/vendor/three/three.core.min.js?v=${versions.get(core)}`);
    assert.ok(result.includes('<script type="module">import "/js/start.js";</script>'));
});

test('pages without modules only version styles and do not retain a stale generated map', () => {
    const result = transformHtml('<head><link rel="stylesheet" href="/css/site.css"></head>', versions);
    assert.equal(result.includes('importmap'), false);
    const stale = transformHtml(page, versions).replace(/  <script type="module"[^\n]*\n/, '');
    assert.equal(transformHtml(stale, versions).includes('importmap'), false);
});

test('malformed maps, unknown local assets and unsafe insertion points fail clearly', () => {
    const wrap = (map) => page.replace('<head>', `<head>${map}`);
    for (const body of ['{', '{"scopes":{}}', '{"imports":null}', '{"imports":{"https://external.example/module.js":"/js/start.js"}}']) {
        assert.throws(() => transformHtml(wrap(`<script type="importmap" id="asset-importmap">${body}</script>`), versions), /import map/i);
    }
    const valid = '<script type="importmap" id="asset-importmap">{"imports":{}}</script>';
    assert.throws(() => transformHtml(wrap(valid + valid), versions), /at most one/);
    assert.throws(() => transformHtml(wrap('<script type="importmap">{}</script>'), versions), /inline script/);
    assert.throws(() => transformHtml('<head><script type="importmap" id="asset-importmap">{', versions), /closing script/);
    assert.throws(() => transformHtml(page.replace('/js/main.js', '/js/missing.js'), versions), /Referenced asset was not found/);
    assert.throws(() => transformHtml('<script type="module" src="/js/start.js"></script>', versions), /before module execution/);
    assert.throws(() => transformHtml(page, new Map([['/js/start.js', 'not-a-hash']])), /Invalid asset version/);
    assert.throws(() => transformHtml(null, versions), TypeError);
});

test('reading assets includes all module dependencies while ignoring documentation and detects content changes', async (t) => {
    const root = await fixture(t);
    const before = await readAssetVersions(root);
    assert.deepEqual([...before.keys()].sort(), [...versions.keys()].sort());
    await writeFile(join(root, 'js/layout.mjs'), 'Updated layout');
    const after = await readAssetVersions(root);
    assert.notEqual(before.get('/js/layout.mjs'), after.get('/js/layout.mjs'));
    assert.equal(before.get('/js/main.js'), after.get('/js/main.js'));
    await rm(join(root, 'css/site.css'));
    await assert.rejects(readAssetVersions(root), /No assets found in css/);
});

test('check mode leaves HTML untouched, sync is idempotent and a changed dependency invalidates every module page', async (t) => {
    const root = await fixture(t);
    const original = await readFile(join(root, 'index.html'), 'utf8');
    assert.deepEqual(await syncAssets(root, { check: true }), HTML_PAGES);
    assert.equal(await readFile(join(root, 'index.html'), 'utf8'), original);
    assert.deepEqual(await syncAssets(root), HTML_PAGES);
    assert.deepEqual(await syncAssets(root, { check: true }), []);
    await utimes(join(root, 'index.html'), 1, 1);
    const before = await stat(join(root, 'index.html'));
    assert.deepEqual(await syncAssets(root), []);
    assert.equal((await stat(join(root, 'index.html'))).mtimeMs, before.mtimeMs);
    await writeFile(join(root, 'vendor/three/three.core.min.js'), 'Updated core');
    assert.deepEqual(await syncAssets(root, { check: true }), HTML_PAGES.filter((name) => name !== '404.html'));
    assert.equal(await readFile(join(root, 'js/start.js'), 'utf8'), 'Contents of /js/start.js');
});

test('an invalid page aborts synchronization before any earlier page is written', async (t) => {
    const root = await fixture(t);
    await writeFile(join(root, '404.html'), '<script src="/js/missing.js"></script>');
    const before = await readFile(join(root, 'index.html'), 'utf8');
    await assert.rejects(syncAssets(root), /Referenced asset was not found/);
    assert.equal(await readFile(join(root, 'index.html'), 'utf8'), before);
});
