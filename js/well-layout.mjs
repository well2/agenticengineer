export const WELL_COURSES = Object.freeze({
    count: 6,
    baseHeight: 0.285,
    upperHeight: 0.17,
    closedStep: 0.204,
    expansionStep: 0.258,
    winchClearance: 0.055,
});
export const WELL_VIEW = Object.freeze({ targetY: 1.46, height: 5.9, narrowExtra: 0.35 });
const clamp = (value) => Math.min(1, Math.max(0, value));
const ease = (value) => value * value * value * (value * (value * 6 - 15) + 10);

export const getCourseHeight = (index) => index === 0 ? WELL_COURSES.baseHeight : WELL_COURSES.upperHeight;

export function getWellLayout(expansion = 0, hoist = 0) {
    if (!Number.isFinite(expansion)) {
        throw new TypeError('Well expansion must be a finite number.');
    }
    if (!Number.isFinite(hoist)) throw new TypeError('Well hoist must be a finite number.');
    const amount = clamp(expansion);
    const hoistAmount = clamp(hoist);
    const lastCourse = WELL_COURSES.count - 1;
    const lift = Array.from({ length: WELL_COURSES.count }, (_, index) =>
        index === 0 ? 0 : ease(clamp((amount - (lastCourse - index) * 0.085) / 0.66)));
    // Thinner upper courses add two stages without changing the rim or winch envelope.
    const courses = lift.map((progress, index) => -0.78
        + (index === 0 ? 0 : WELL_COURSES.baseHeight - WELL_COURSES.upperHeight)
        + index * WELL_COURSES.closedStep + progress * index * WELL_COURSES.expansionStep);
    const twists = lift.map((progress, index) => Math.sin(progress * Math.PI) * (index % 2 ? 0.085 : -0.085));
    const winch = courses.at(-1) + WELL_COURSES.upperHeight + WELL_COURSES.winchClearance;
    const axle = winch + 1.06;
    // Bucket travel stays monotonic while the surrounding masonry unfolds.
    const bucket = -0.73 + hoistAmount * 1.685;
    const ropeBottom = bucket + 0.465;
    const ropeLength = Math.max(0.22, axle - ropeBottom);
    const crankAngle = hoistAmount * Math.PI * 4;
    return { courses, twists, winch, bucket, axle, ropeBottom, ropeLength, crankAngle };
}

export function sampleWellTransition(from, to, elapsed, reducedMotion = false) {
    if (![from, to, elapsed].every(Number.isFinite)) throw new TypeError('Animation values must be finite.');
    const start = clamp(from);
    const end = clamp(to);
    const duration = 1150 * Math.abs(end - start);
    const progress = reducedMotion || duration === 0 ? 1 : clamp(elapsed / duration);
    return { value: start + (end - start) * progress, complete: progress === 1 };
}
