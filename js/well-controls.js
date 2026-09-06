import { OrbitControls } from '../vendor/three/OrbitControls.min.js';
import { WELL_VIEW } from './well-layout.mjs';

export function createWellControls(camera, element, reducedMotion, requestRender, english) {
    const controls = new OrbitControls(camera, element);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = !reducedMotion.matches;
    controls.dampingFactor = 0.13;
    controls.rotateSpeed = 0.65;
    controls.minPolarAngle = 0.42;
    controls.maxPolarAngle = 1.36;
    controls.mouseButtons.MIDDLE = null;
    controls.mouseButtons.RIGHT = null;
    controls.cursorStyle = 'grab';
    controls.target.set(0, WELL_VIEW.targetY, 0);
    controls.update();
    controls.saveState();
    element.style.touchAction = 'pan-y pinch-zoom';
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', english ? 'Interactive 3D well model' : 'Interaktivní 3D model studny');
    if (element.ownerDocument.getElementById('wellHint')) element.setAttribute('aria-describedby', 'wellHint');

    function keepTouchScrolling(event) {
        if (event.pointerType === 'touch') event.stopImmediatePropagation();
    }

    function onKeyDown(event) {
        if (event.altKey || event.ctrlKey || event.metaKey || !controls.enabled) return;
        const actions = {
            ArrowLeft: () => controls.rotateLeft(0.18),
            ArrowRight: () => controls.rotateLeft(-0.18),
            ArrowUp: () => controls.rotateUp(0.12),
            ArrowDown: () => controls.rotateUp(-0.12),
            Home: () => {
                const damping = controls.enableDamping;
                controls.enableDamping = false;
                controls.update();
                controls.reset();
                controls.enableDamping = damping;
            },
        };
        if (!actions[event.key]) return;
        event.preventDefault();
        actions[event.key]();
        requestRender();
    }

    controls.addEventListener('change', requestRender);
    element.addEventListener('pointerdown', keepTouchScrolling, { capture: true });
    element.addEventListener('keydown', onKeyDown);

    return {
        update: () => controls.update(),
        setEnabled(enabled) {
            if (!enabled && controls.enabled) {
                const position = camera.position.clone();
                const damping = controls.enableDamping;
                controls.enableDamping = false;
                controls.update();
                camera.position.copy(position);
                controls.update();
                controls.enableDamping = damping;
            }
            controls.enabled = enabled;
        },
        syncMotion: () => { controls.enableDamping = !reducedMotion.matches; },
        dispose() {
            controls.removeEventListener('change', requestRender);
            element.removeEventListener('pointerdown', keepTouchScrolling, { capture: true });
            element.removeEventListener('keydown', onKeyDown);
            controls.dispose();
            for (const attribute of ['tabindex', 'role', 'aria-label', 'aria-describedby']) element.removeAttribute(attribute);
        },
    };
}
