const clamp = (value) => Math.max(0, Math.min(1, value));
const ramp = (value, start, end) => {
    const step = clamp((value - start) / (end - start));
    return step * step * (3 - 2 * step);
};

export function getDeliveryState(pourProgress, hasDelivery, reducedMotion = false) {
    if (pourProgress !== null && !Number.isFinite(pourProgress)) {
        throw new TypeError('Delivery pour progress must be finite or null.');
    }
    const complete = Boolean(hasDelivery && pourProgress === null);
    const phase = !hasDelivery || (reducedMotion && !complete) ? 0 : complete ? 1 : clamp(pourProgress);
    return {
        reveal: ramp(phase, 0.36, 0.48),
        frame: ramp(phase, 0.38, 0.66),
        settle: ramp(phase, 0.42, 0.94),
        verify: ramp(phase, 0.84, 0.98),
        glow: Math.sin(Math.PI * ramp(phase, 0.35, 1)),
        sweep: ramp(phase, 0.84, 0.98),
        parts: [0.48, 0.53, 0.58, 0.63, 0.68].map((start) => ramp(phase, start, start + 0.22)),
        complete,
    };
}

export function getDeliveryReveal(pourProgress, hasDelivery, reducedMotion = false) {
    return getDeliveryState(pourProgress, hasDelivery, reducedMotion).reveal;
}

export function createWellDelivery(element) {
    function hide() {
        if (!element) return;
        element.hidden = true;
        element.setAttribute('aria-hidden', 'true');
    }

    hide();
    return {
        update(pourProgress, hasDelivery, reducedMotion = false, anchor = null) {
            const state = getDeliveryState(pourProgress, hasDelivery, reducedMotion);
            if (anchor && (![anchor.x, anchor.y].every(Number.isFinite)
                || (anchor.width !== undefined && (!Number.isFinite(anchor.width) || anchor.width <= 0)))) {
                throw new TypeError('Delivery anchor must contain finite screen coordinates.');
            }
            if (!element) return;
            element.hidden = state.reveal <= 0;
            element.setAttribute('aria-hidden', String(!state.complete));
            element.style.setProperty('--delivery-progress', String(state.reveal));
            for (const key of ['frame', 'settle', 'verify', 'glow', 'sweep']) {
                element.style.setProperty(`--creation-${key}`, String(state[key]));
            }
            state.parts.forEach((progress, index) => element.style.setProperty(`--creation-part-${index}`, String(progress)));
            if (anchor) {
                element.style.setProperty('--creation-x', `${anchor.x}px`);
                element.style.setProperty('--creation-y', `${anchor.y}px`);
                if (anchor.width !== undefined) element.style.setProperty('--creation-width', `${anchor.width}px`);
            }
            element.dataset.complete = String(state.complete);
        },
        hide,
        dispose: hide,
    };
}
