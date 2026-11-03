/* Start the decorative 3D model after the first paint without moving focus. */
const mount = document.getElementById('wellModel');
const status = document.getElementById('wellLoadStatus');
const english = document.documentElement.lang === 'en';
const saveData = navigator.connection?.saveData;
const messages = english
    ? {
        loading: 'Loading the interactive well…',
        error: 'The 3D model could not load. You can explore the workshop below.',
        saveData: 'Data Saver is on, so the 3D model is paused. You can explore the workshop below.',
    }
    : {
        loading: 'Načítám interaktivní studnu…',
        error: '3D model se nepodařilo načíst. Kovárnu si můžete prohlédnout níže.',
        saveData: 'Je zapnutá úspora dat, proto se 3D model nenačítá. Kovárnu si můžete prohlédnout níže.',
    };
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

function onError() {
    if (!active) return;
    report(messages.error);
    mount.setAttribute('aria-busy', 'false');
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

async function start() {
    if (requested || !active || suspended) return;
    requested = true;
    mount.setAttribute('aria-busy', 'true');
    report(messages.loading);
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
    if (saveData) report(messages.saveData);
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
