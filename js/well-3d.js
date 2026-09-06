import { getWellLayout, sampleWellTransition, WELL_VIEW } from './well-layout.mjs';
import { createWaterState, startPour, stepWater } from './well-water-state.mjs';
import { createWellDelivery } from './well-delivery.js';

const mount = document.getElementById('wellModel');
const figure = mount?.closest('.hero-well');
const toggle = document.getElementById('wellToggle');
const layers = document.getElementById('wellLayers');
const status = document.getElementById('wellStatus');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let cleanup = () => {};
let started = false;

function updateLayerVisibility(visible) {
    if (layers) {
        layers.hidden = !visible;
        toggle?.setAttribute('aria-expanded', String(visible));
    }
    figure?.classList[visible ? 'add' : 'remove']('is-expanded');
}

updateLayerVisibility(false);

async function initialize() {
    if (started || !mount || !figure) return;
    started = true;
    const canvas = document.createElement('canvas');
    let renderer;
    let model;
    let observer;
    let controls;
    let hoist;
    let pourControl;
    let stages;
    const delivery = createWellDelivery(document.getElementById('wellDelivery'));
    let frame = 0;
    let active = true;
    let disposed = false;
    let hasSize = false;
    const listeners = [];

    cleanup = () => {
        if (disposed) return;
        disposed = true;
        active = false;
        cancelAnimationFrame(frame);
        frame = 0;
        observer?.disconnect();
        listeners.splice(0).forEach((remove) => remove());
        hoist?.dispose();
        pourControl?.dispose();
        stages?.dispose();
        delivery.dispose();
        controls?.dispose();
        model?.dispose();
        renderer?.dispose();
        canvas.remove();
        figure.classList.remove('is-3d-ready');
        updateLayerVisibility(false);
        if (toggle) toggle.hidden = true;
    };

    function listen(target, event, handler, options) {
        if (!target) return;
        target.addEventListener(event, handler, options);
        listeners.push(() => target.removeEventListener(event, handler, options));
    }

    try {
        const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
        if (!context) return;
        const [THREE, { createWellScene }, { createWellControls }, { createWellHoist }, { createBucketPourControl }, { createWellStages }] = await Promise.all([
            import('../vendor/three/three.module.min.js'),
            import('./well-scene.js'),
            import('./well-controls.js'),
            import('./well-hoist.js'),
            import('./well-bucket-control.js'),
            import('./well-stages.js'),
        ]);
        if (disposed) return;
        renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.95;

        model = createWellScene(THREE);
        const camera = new THREE.OrthographicCamera();
        camera.position.set(6.7, 5.2, 8.5);
        camera.near = 0.1;
        camera.far = 50;
        canvas.setAttribute('aria-hidden', 'true');
        mount.appendChild(canvas);

        let expansion = 0;
        let bucketLift = 1;
        let water = createWaterState();
        let hasDelivery = false;
        let lastFrameTime = null;
        let transition = null;
        let aspect = 1;
        // Capture crank gestures before OrbitControls and its native-touch guard.
        hoist = createWellHoist(model, camera, mount, {
            initialLift: 1,
            onChange(value) {
                if (water.pourProgress !== null) return;
                transition = null;
                bucketLift = value;
                requestRender();
            },
            onDragChange(dragging) {
                if (dragging) transition = null;
                controls?.setEnabled(!dragging && active);
            },
        });
        pourControl = createBucketPourControl(model, camera, mount, {
            onPour() {
                const next = startPour(water, bucketLift);
                if (next === water) return;
                water = next;
                hasDelivery = true;
                transition = null;
                hoist.cancel();
                requestRender();
            },
            onDragChange(dragging) { controls?.setEnabled(!dragging && active); },
        });
        controls = createWellControls(camera, mount, reducedMotion, requestRender, document.documentElement.lang === 'en');
        stages = createWellStages(THREE, model, camera, mount, layers);

        function render(time = 0) {
            frame = 0;
            if (!active || !hasSize || document.hidden) return;
            try {
                draw(time);
            } catch {
                cleanup();
            }
        }

        function draw(time) {
            const delta = lastFrameTime === null ? 0 : Math.min(64, Math.max(0, time - lastFrameTime));
            lastFrameTime = time;
            if (transition) {
                transition.start ??= time;
                const next = sampleWellTransition(transition.from, transition.to, time - transition.start, reducedMotion.matches);
                bucketLift = next.value;
                if (next.complete) transition = null;
            }
            expansion = 1 - bucketLift;
            if (bucketLift < 0.97) hasDelivery = false;
            const waterStep = stepWater(water, bucketLift, delta, reducedMotion.matches);
            water = waterStep.state;
            const layout = getWellLayout(expansion, bucketLift);
            model.update(layout, water);
            model.sculpture.rotation.set(0, -0.18, 0);
            const viewHeight = WELL_VIEW.height + (aspect < 0.8 ? WELL_VIEW.narrowExtra : 0);
            camera.left = -viewHeight * aspect / 2;
            camera.right = viewHeight * aspect / 2;
            camera.top = viewHeight / 2;
            camera.bottom = -viewHeight / 2;
            camera.updateProjectionMatrix();
            const controlsMoving = controls.update();
            model.updateTransformation(water.pourProgress, hasDelivery, camera, reducedMotion.matches);
            renderer.render(model.scene, camera);
            hoist.setEnabled(water.pourProgress === null);
            hoist.update(bucketLift);
            pourControl.setEnabled(!transition && water.pourProgress === null);
            pourControl.update(bucketLift >= 0.97 && water.fill > 0 && water.pourProgress === null);
            figure.classList.add('is-3d-ready');
            stages.update(layout, expansion, reducedMotion.matches);
            updateLayerVisibility(expansion > 0.06);
            const bounds = mount.getBoundingClientRect();
            delivery.update(water.pourProgress, hasDelivery, reducedMotion.matches, model.projectDelivery(camera, bounds.width, bounds.height));
            updateToggle();
            updateStatus();
            if (toggle) toggle.hidden = false;
            if (transition || controlsMoving || waterStep.animating) requestRender();
            else lastFrameTime = null;
        }

        function requestRender() {
            if (!frame && active && hasSize && !document.hidden) frame = requestAnimationFrame(render);
        }

        function resize() {
            if (!active) return;
            const { width, height } = mount.getBoundingClientRect();
            hasSize = width > 0 && height > 0;
            if (!hasSize) return;
            try {
                renderer.setSize(width, height, false);
            } catch {
                cleanup();
                return;
            }
            aspect = width / height;
            requestRender();
        }

        function updateToggle() {
            if (!toggle) return;
            const english = document.documentElement.lang === 'en';
            const lower = bucketLift > 0.5;
            toggle.textContent = lower
                ? (english ? 'Lower the bucket' : 'Spustit kýbl')
                : (english ? 'Raise the bucket' : 'Vytáhnout kýbl');
            toggle.dataset.direction = lower ? 'down' : 'up';
            toggle.disabled = water.pourProgress !== null;
        }

        function updateStatus() {
            if (!status) return;
            const english = document.documentElement.lang === 'en';
            const messages = english
                ? ['Empty bucket. Lower it to the water.', 'Filling the bucket…', 'Water collected. Raise the bucket.', 'Water is up. Click the bucket to create.', 'From experience to maintainable software…', 'Anvil, Forge and Temper — a foundation for long-term maintainability.']
                : ['Prázdný kýbl. Spusť ho k vodě.', 'Kýbl nabírá vodu…', 'Voda je v kýblu. Vytáhni ho nahoru.', 'Voda je nahoře. Klikni na kýbl a tvoř.', 'Ze zkušeností vzniká udržovatelný software…', 'Anvil, Forge a Temper — opora pro dlouhodobou udržovatelnost.'];
            const index = water.pourProgress !== null ? 4
                : hasDelivery ? 5 : bucketLift <= 0.015 && water.fill < 1 ? 1
                    : water.fill > 0 ? (bucketLift >= 0.97 ? 3 : 2) : 0;
            if (status.textContent !== messages[index]) status.textContent = messages[index];
        }

        function onToggle() {
            if (water.pourProgress !== null) return;
            hoist.cancel();
            pourControl.cancel();
            transition = { from: bucketLift, to: bucketLift > 0.5 ? 0 : 1, start: null };
            requestRender();
        }

        function onMotionChange() {
            controls.syncMotion();
            requestRender();
        }

        function onContextLost(event) {
            event.preventDefault();
            active = false;
            hoist.setEnabled(false);
            pourControl.setEnabled(false);
            stages.hide();
            delivery.hide();
            controls.setEnabled(false);
            cancelAnimationFrame(frame);
            frame = 0;
            figure.classList.remove('is-3d-ready');
            updateLayerVisibility(false);
            if (toggle) toggle.hidden = true;
        }

        function onContextRestored() {
            if (disposed) return;
            active = true;
            controls.setEnabled(true);
            resize();
        }

        observer = new ResizeObserver(resize);
        observer.observe(mount);
        listen(toggle, 'click', onToggle);
        listen(reducedMotion, 'change', onMotionChange);
        listen(document, 'visibilitychange', () => {
            if (document.hidden) { hoist.cancel(); pourControl.cancel(); lastFrameTime = null; }
            requestRender();
        });
        listen(canvas, 'webglcontextlost', onContextLost);
        listen(canvas, 'webglcontextrestored', onContextRestored);
        updateToggle();
        resize();
    } catch {
        cleanup();
    }
}

if (mount && !navigator.connection?.saveData) {
    if ('IntersectionObserver' in window) {
        const viewportObserver = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                viewportObserver.disconnect();
                initialize();
            }
        }, { rootMargin: '120px' });
        viewportObserver.observe(mount);
    } else {
        initialize();
    }
}

window.addEventListener('pagehide', (event) => {
    if (!event.persisted) cleanup();
});
