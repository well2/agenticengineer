import { getCourseHeight, WELL_COURSES } from './well-layout.mjs';

const STARTS = [0.04, 0.18, 0.32, 0.46, 0.6];
const REVEAL_SPAN = 0.36;
const CONNECTOR_RUN = 26;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function getStageReveal(expansion, index) {
    if (!Number.isFinite(expansion) || !Number.isInteger(index) || index < 0 || index >= STARTS.length) {
        throw new TypeError('Stage expansion must be finite and its index must be between 0 and 4.');
    }
    const progress = clamp((clamp(expansion, 0, 1) - STARTS[index]) / REVEAL_SPAN, 0, 1);
    if (progress >= 1 - 1e-12) return 1;
    return progress * progress * (3 - 2 * progress);
}

export function createWellStages(THREE, model, camera, mount, list) {
    const items = list ? [...list.querySelectorAll(':scope > li')].slice(0, STARTS.length) : [];
    if (!items.length) return { update() {}, hide() {}, dispose() {} };
    const point = new THREE.Vector3();
    let disposed = false;

    function setVisibility(item, reveal) {
        const interactive = reveal === 1;
        if (!interactive && item.contains(mount.ownerDocument.activeElement)) mount.focus({ preventScroll: true });
        item.hidden = reveal === 0;
        item.inert = !interactive;
        item.setAttribute('aria-hidden', String(!interactive));
        item.style.setProperty('--stage-reveal', String(reveal));
    }

    function hide() {
        items.forEach((item) => setVisibility(item, 0));
    }

    function separatePositions(positions, height) {
        const padding = Math.min(30, height / 2);
        const bottom = height - padding;
        const gap = Math.min(60, (bottom - padding) / Math.max(1, positions.length - 1));
        const spaced = positions.map((position) => clamp(position, padding, bottom));
        for (let index = 1; index < spaced.length; index++) spaced[index] = Math.max(spaced[index], spaced[index - 1] + gap);
        spaced[spaced.length - 1] = Math.min(spaced.at(-1), bottom);
        for (let index = spaced.length - 2; index >= 0; index--) spaced[index] = Math.min(spaced[index], spaced[index + 1] - gap);
        return spaced;
    }

    hide();

    return {
        update(layout, expansion, reducedMotion = false) {
            if (disposed) return;
            const reveals = items.map((_, index) => getStageReveal(expansion, index));
            if (!Array.isArray(layout?.courses) || layout.courses.length !== WELL_COURSES.count || !layout.courses.every(Number.isFinite)) {
                throw new TypeError('Stage layout must contain six finite course heights.');
            }
            const { width, height } = mount.getBoundingClientRect();
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) { hide(); return; }
            camera.updateMatrixWorld();
            model.sculpture.updateWorldMatrix(true, false);
            const positions = items.map((_, index) => {
                const upper = WELL_COURSES.count - 1 - index;
                const midpoint = (layout.courses[upper] + layout.courses[upper - 1] + getCourseHeight(upper - 1)) / 2;
                point.set(0, midpoint, 0);
                model.sculpture.localToWorld(point).project(camera);
                return (1 - point.y) * height / 2;
            });
            if (!positions.every(Number.isFinite)) { hide(); return; }
            const spaced = separatePositions(positions, height);
            const connectors = positions.map((position, index) => {
                const offset = position - spaced[index];
                return { length: Math.hypot(CONNECTOR_RUN, offset), angle: Math.atan2(offset, CONNECTOR_RUN) };
            });
            if (!connectors.every(({ length, angle }) => Number.isFinite(length) && Number.isFinite(angle))) { hide(); return; }
            items.forEach((item, index) => {
                item.style.setProperty('--stage-y', `${spaced[index]}px`);
                item.style.setProperty('--stage-target-y', `${positions[index]}px`);
                item.style.setProperty('--stage-connector-length', `${connectors[index].length}px`);
                item.style.setProperty('--stage-connector-angle', `${connectors[index].angle}rad`);
                setVisibility(item, reducedMotion ? Number(reveals[index] > 0) : reveals[index]);
            });
        },
        hide,
        dispose() {
            disposed = true;
            hide();
        },
    };
}
