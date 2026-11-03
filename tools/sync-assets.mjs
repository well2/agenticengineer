import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HTML_PAGES = ['index.html', 'en/index.html', 'tools/social-preview.html', '404.html'];
const ASSET_DIRECTORIES = [['js', /\.(?:js|mjs)$/], ['css', /\.css$/], ['vendor/three', /\.js$/]];
const ASSET_PATH = /^\/(?:js\/[^/]+\.(?:js|mjs)|css\/[^/]+\.css|vendor\/three\/[^/]+\.js)$/;
const SCRIPT_OPEN = /<script\b[^>]*>/gi;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const ORIGIN = 'https://asset-sync.invalid';

export function hashAsset(contents) {
    if (typeof contents !== 'string' && !(contents instanceof Uint8Array)) {
        throw new TypeError('Asset contents must be a string or byte array.');
    }
    return createHash('sha256').update(contents).digest('hex').slice(0, 12);
}

export async function readAssetVersions(root) {
    const versions = new Map();
    for (const [directory, extension] of ASSET_DIRECTORIES) {
        const entries = await readdir(resolve(root, directory), { withFileTypes: true });
        const names = entries.filter((entry) => entry.isFile() && extension.test(entry.name)).map((entry) => entry.name).sort();
        if (!names.length) throw new Error(`No assets found in ${directory}.`);
        for (const name of names) {
            const path = `/${directory}/${name}`;
            versions.set(path, hashAsset(await readFile(resolve(root, directory, name))));
        }
    }
    return versions;
}

function attribute(tag, name) {
    return tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
}

function validateVersions(versions) {
    if (!(versions instanceof Map) || !versions.size) throw new TypeError('Asset versions must be a nonempty Map.');
    for (const [path, hash] of versions) {
        if (typeof path !== 'string' || typeof hash !== 'string' || !ASSET_PATH.test(path) || !/^[a-f0-9]{12}$/.test(hash)) {
            throw new TypeError(`Invalid asset version: ${path}.`);
        }
    }
}

function removeImportMap(html) {
    const maps = [...html.matchAll(SCRIPT_OPEN)].filter(([tag]) =>
        /\s(?:type\s*=\s*["']?importmap|id\s*=\s*["']?asset-importmap)(?:["'\s>])/i.test(tag));
    if (maps.length > 1) throw new Error('Expected at most one asset import map.');
    if (!maps.length) return html;
    const [opening] = maps[0];
    if (attribute(opening, 'type') !== 'importmap' || attribute(opening, 'id') !== 'asset-importmap' || attribute(opening, 'src')) {
        throw new Error('Asset import map must be an inline script with type="importmap" and id="asset-importmap".');
    }
    const block = [...html.matchAll(SCRIPT_BLOCK)].find((match) => match.index === maps[0].index);
    if (!block) throw new Error('Asset import map is missing its closing script tag.');
    let data;
    try { data = JSON.parse(block[0].slice(opening.length).replace(/<\/script\s*>$/i, '')); }
    catch { throw new Error('Asset import map contains invalid JSON.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).join() !== 'imports'
        || !data.imports || typeof data.imports !== 'object' || Array.isArray(data.imports)
        || Object.entries(data.imports).some(([path, value]) => !ASSET_PATH.test(path) || typeof value !== 'string')) {
        throw new Error('Asset import map must contain only an imports object for local asset paths.');
    }
    const start = block.index;
    const lineStart = html.lastIndexOf('\n', start - 1) + 1;
    const from = /^\s*$/.test(html.slice(lineStart, start)) ? lineStart : start - html.slice(0, start).match(/[ \t]*$/)[0].length;
    const end = start + block[0].length;
    const after = html.slice(end).match(/^[ \t]*\r?\n/);
    return html.slice(0, from) + html.slice(end + (after?.[0].length ?? 0));
}

function versionReference(value, versions, pagePath) {
    const decoded = value.replaceAll('&amp;', '&');
    const url = new URL(decoded, `${ORIGIN}/${pagePath}`);
    if (url.origin !== ORIGIN || !ASSET_PATH.test(url.pathname)) return value;
    const hash = versions.get(url.pathname);
    if (!hash) throw new Error(`Referenced asset was not found: ${url.pathname} (${pagePath}).`);
    url.searchParams.set('v', hash);
    return decoded.split(/[?#]/, 1)[0] + url.search.replaceAll('&', '&amp;') + url.hash;
}

export function transformHtml(html, versions, pagePath = 'index.html') {
    if (typeof html !== 'string') throw new TypeError('HTML must be a string.');
    validateVersions(versions);
    let result = removeImportMap(html);
    // These four controlled pages use quoted attributes; this is deliberately not a general HTML parser.
    result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<link\b[^>]*>/gi, (block) => {
        const opening = block.match(/^<[^>]*>/)[0];
        const script = /^<script\b/i.test(opening);
        if (!script && !attribute(opening, 'rel')?.split(/\s+/).includes('stylesheet')) return block;
        const name = script ? 'src' : 'href';
        const value = attribute(opening, name);
        if (!value) return block;
        const updated = opening.replace(new RegExp(`(\\s${name}\\s*=\\s*)(["'])(.*?)\\2`, 'i'),
            (_, prefix, quote) => `${prefix}${quote}${versionReference(value, versions, pagePath)}${quote}`);
        return updated + block.slice(opening.length);
    });
    const modules = [...result.matchAll(SCRIPT_OPEN)].filter(([tag]) => attribute(tag, 'type') === 'module');
    if (!modules.length) return result;
    const head = result.match(/<head\b[^>]*>/i);
    const close = result.match(/<\/head\s*>/i);
    if (!head || !close || head.index >= close.index || modules[0].index < head.index + head[0].length) {
        throw new Error(`Cannot place the asset import map before module execution in ${pagePath}.`);
    }
    const json = [...result.matchAll(SCRIPT_OPEN)].find((match) =>
        attribute(match[0], 'type') === 'application/ld+json' && match.index > head.index && match.index < close.index);
    const insertion = Math.min(json?.index ?? close.index, close.index, modules[0].index);
    const lineStart = result.lastIndexOf('\n', insertion - 1) + 1;
    const at = /^[ \t]*$/.test(result.slice(lineStart, insertion)) ? lineStart : insertion;
    const imports = Object.fromEntries([...versions].filter(([path]) => !path.startsWith('/css/')).sort(([a], [b]) => a < b ? -1 : 1)
        .map(([path, hash]) => [path, `${path}?v=${hash}`]));
    // Native import maps version the full module graph without adding a bundler to this static site.
    const map = `  <script type="importmap" id="asset-importmap">\n${JSON.stringify({ imports }, null, 2).split('\n').map((line) => `  ${line}`).join('\n')}\n  </script>\n`;
    return result.slice(0, at) + map + result.slice(at);
}

export async function syncAssets(root, { check = false } = {}) {
    const versions = await readAssetVersions(root);
    const changes = [];
    for (const page of HTML_PAGES) {
        const file = resolve(root, page);
        const before = await readFile(file, 'utf8');
        const after = transformHtml(before, versions, page);
        if (before !== after) changes.push({ page, file, after });
    }
    if (!check) for (const { file, after } of changes) await writeFile(file, after);
    return changes.map(({ page }) => page);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2);
        if (args.some((argument) => argument !== '--check') || args.length > 1) throw new Error('Usage: node tools/sync-assets.mjs [--check]');
        const check = args.includes('--check');
        const changed = await syncAssets(fileURLToPath(new URL('..', import.meta.url)), { check });
        if (check && changed.length) {
            console.error(`Asset versions are outdated: ${changed.join(', ')}. Run node tools/sync-assets.mjs.`);
            process.exitCode = 1;
        } else console.log(changed.length ? `Updated asset versions: ${changed.join(', ')}.` : 'Asset versions are current.');
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
