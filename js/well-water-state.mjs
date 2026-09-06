const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => value * value * (3 - 2 * value);
const FILL_DURATION = 700;
export const POUR_DURATION = 3600;

export function getPourWaterProgress(progress) {
    if (progress === null) return null;
    if (!Number.isFinite(progress)) throw new TypeError('Pour progress must be finite or null.');
    return clamp(progress / 0.56);
}

function normalizeState(state) {
    if (!state || !Number.isFinite(state.fill) || !Number.isFinite(state.pourStartFill)
        || (state.pourProgress !== null && !Number.isFinite(state.pourProgress))) {
        throw new TypeError('Water state must contain finite fill values and a valid pour progress.');
    }
    return {
        fill: clamp(state.fill),
        pourProgress: state.pourProgress === null ? null : clamp(state.pourProgress),
        pourStartFill: clamp(state.pourStartFill),
    };
}

export function createWaterState() {
    return { fill: 0, pourProgress: null, pourStartFill: 0 };
}

export function startPour(state, lift) {
    if (!Number.isFinite(lift)) throw new TypeError('Bucket lift must be finite.');
    const current = normalizeState(state);
    if (clamp(lift) < 0.97 || current.fill <= 0 || current.pourProgress !== null) return state;
    return { fill: current.fill, pourProgress: 0, pourStartFill: current.fill };
}

export function stepWater(state, lift, deltaMs, reducedMotion = false) {
    if (!Number.isFinite(lift) || !Number.isFinite(deltaMs)) {
        throw new TypeError('Bucket lift and frame duration must be finite.');
    }
    const current = normalizeState(state);
    const elapsed = Math.max(0, deltaMs);
    if (current.pourProgress !== null) {
        const progress = reducedMotion ? 1 : clamp(current.pourProgress + elapsed / POUR_DURATION);
        if (progress === 1) return { state: createWaterState(), animating: false };
        const drained = ease(clamp((getPourWaterProgress(progress) - 0.22) / 0.5));
        return {
            state: { ...current, fill: current.pourStartFill * (1 - drained), pourProgress: progress },
            animating: true,
        };
    }
    if (clamp(lift) <= 0.015 && current.fill < 1) {
        const fill = reducedMotion ? 1 : clamp(current.fill + elapsed / FILL_DURATION);
        return { state: { ...current, fill }, animating: fill < 1 };
    }
    return { state: current, animating: false };
}

export function getPourPose(progress) {
    if (progress === null) return { tip: 0, stream: 0 };
    if (!Number.isFinite(progress)) throw new TypeError('Pour progress must be finite or null.');
    const phase = getPourWaterProgress(progress);
    const tip = phase <= 0.28
        ? ease(clamp(phase / 0.28))
        : 1 - ease(clamp((phase - 0.72) / 0.28));
    const stream = ease(clamp((phase - 0.22) / 0.1)) * (1 - ease(clamp((phase - 0.65) / 0.12)));
    return { tip: tip * 1.1, stream };
}
