const STARTS = [0.06, 0.25, 0.44];
const REVEAL_SPAN = 0.46;
const COURSE_HEIGHT = 0.285;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function getStageReveal(expansion, index) {
    if (!Number.isFinite(expansion) || !Number.isInteger(index) || index < 0 || index >= STARTS.length) {
        throw new TypeError('Stage expansion must be finite and its index must be 0, 1, or 2.');
    }
    const progress = clamp((clamp(expansion, 0, 1) - STARTS[index]) / REVEAL_SPAN, 0, 1);
    if (progress >= 1 - 1e-12) return 1;
    return progress * progress * (3 - 2 * progress);
}

export function createWellStages(THREE, model, camera, mount, list) {
    const items = list ? [...list.querySelectorAll(':scope > li')].slice(0, 3) : [];
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
            if (!Array.isArray(layout?.courses) || layout.courses.length !== 4 || !layout.courses.every(Number.isFinite)) {
                throw new TypeError('Stage layout must contain four finite course heights.');
            }
            const { width, height } = mount.getBoundingClientRect();
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) { hide(); return; }
            camera.updateMatrixWorld();
            model.sculpture.updateWorldMatrix(true, false);
            const positions = items.map((_, index) => {
                const upper = 3 - index;
                const midpoint = (layout.courses[upper] + layout.courses[upper - 1] + COURSE_HEIGHT) / 2;
                point.set(0, midpoint, 0);
                model.sculpture.localToWorld(point).project(camera);
                return (1 - point.y) * height / 2;
            });
            if (!positions.every(Number.isFinite)) { hide(); return; }
            const spaced = separatePositions(positions, height);
            items.forEach((item, index) => {
                item.style.setProperty('--stage-y', `${spaced[index]}px`);
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
