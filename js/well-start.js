/* Start the decorative 3D model after the first paint without moving focus. */
const mount = document.getElementById('wellModel');
const figure = mount?.closest?.('.hero-well');
const status = document.getElementById('wellLoadStatus');
const english = document.documentElement.lang === 'en';
const saveData = navigator.connection?.saveData;
const messages = english
    ? {
        loading: 'Loading the interactive well…',
        error: 'The 3D model could not load. You can explore Forge below.',
        saveData: 'Data Saver is on, so the 3D model is paused. You can explore Forge below.',
    }
    : {
        loading: 'Načítám interaktivní studnu…',
        error: '3D model se nepodařilo načíst. Forge si můžete prohlédnout níže.',
        saveData: 'Je zapnutá úspora dat, proto se 3D model nenačítá. Forge si můžete prohlédnout níže.',
    };
// Both halves of Three.js are requested together with the model code. Discovering them one
// import at a time is what delays the model most on a slow connection.
const ENGINE_MODULES = ['../vendor/three/three.module.min.js', '../vendor/three/three.core.min.js'];
let requested = false;
let initialized = false;
let ready = false;
let active = true;
let suspended = false;
let frame = 0;
let model;

function report(message) {
    if (status) status.textContent = message;
}

// Without the model, the reserved canvas area collapses to a compact static mark.
function showStatic() {
    figure?.classList.add('is-static');
}

function onError() {
    if (!active) return;
    report(messages.error);
    mount.setAttribute('aria-busy', 'false');
    showStatic();
}

async function initializeModel() {
    if (!active || suspended || initialized || !model) return;
    initialized = true;
    try {
        await model.initialize({
            onReady() {
                if (!active || ready) return;
                ready = true;
                mount.setAttribute('aria-busy', 'false');
                report('');
            },
            onError,
        });
    } catch {
        onError();
    }
}

function preloadEngine() {
    try {
        if (!('WebGL2RenderingContext' in window) || typeof import.meta.resolve !== 'function') return;
        for (const specifier of ENGINE_MODULES) {
            const link = document.createElement('link');
            link.rel = 'modulepreload';
            link.href = import.meta.resolve(specifier);
            document.head.append(link);
        }
    } catch {
        // Preloading is an optimization; the model still loads through its own imports.
    }
}

async function start() {
    if (requested || !active || suspended) return;
    requested = true;
    mount.setAttribute('aria-busy', 'true');
    report(messages.loading);
    preloadEngine();
    try {
        model = await import('./well-3d.js');
        await initializeModel();
    } catch {
        onError();
    }
}

function schedule() {
    if (frame || requested || !active || suspended || saveData) return;
    frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
            frame = 0;
            return start();
        });
    });
}

if (mount) {
    if (saveData) { report(messages.saveData); showStatic(); }
    else schedule();
    window.addEventListener('pagehide', (event) => {
        cancelAnimationFrame(frame);
        frame = 0;
        suspended = true;
        if (!event.persisted) active = false;
    });
    window.addEventListener('pageshow', () => {
        if (!active) return;
        suspended = false;
        if (model) initializeModel();
        else schedule();
    });
}
