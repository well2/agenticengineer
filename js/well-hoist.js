import { Raycaster, Vector2, Vector3 } from '../vendor/three/three.module.min.js';

const clamp = (value) => Math.min(1, Math.max(0, value));

export function createWellHoist(model, camera, element, { onChange, onDragChange, initialLift = 1 }) {
    const marker = element.ownerDocument.getElementById('wellCrank');
    if (!marker) return { update() {}, setEnabled() {}, cancel() {}, dispose() {} };
    const english = element.ownerDocument.documentElement.lang === 'en';
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const projected = new Vector3();
    let lift = Number.isFinite(initialLift) ? clamp(initialLift) : 1;
    let enabled = true;
    let drag = null;
    let disposed = false;

    function updateValue(value, notify = true) {
        if (!Number.isFinite(value)) return;
        const next = clamp(value);
        if (next === lift) return;
        lift = next;
        updateLabel();
        if (notify) onChange(lift);
    }

    function updateLabel() {
        const percentage = Math.round(lift * 100);
        marker.setAttribute('aria-valuenow', String(percentage));
        marker.setAttribute('aria-valuetext', percentage === 0
            ? (english ? 'Bucket in the water' : 'Kýbl u vody')
            : percentage === 100 ? (english ? 'Bucket raised' : 'Kýbl vytažený')
                : (english ? `Bucket ${percentage}% raised` : `Kýbl vytažený na ${percentage} %`));
    }

    function refreshRay(event) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        camera.updateMatrixWorld();
        model.sculpture.updateWorldMatrix(true, true);
        raycaster.setFromCamera(pointer, camera);
        return true;
    }

    function isCrank(event) {
        if (marker.contains(event.target)) return true;
        if (event.target.closest?.('button, [role="slider"]')) return false;
        return refreshRay(event) && raycaster.intersectObject(model.crankGrip, false).length > 0;
    }

    function onPointerDown(event) {
        if (!enabled || drag || event.isPrimary === false || event.button !== 0 || !Number.isFinite(event.clientY) || !isCrank(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const travel = Math.max(200, Math.min(320, element.getBoundingClientRect().height / 2));
        drag = { id: event.pointerId, y: event.clientY, travel };
        try { element.setPointerCapture(event.pointerId); }
        catch { drag = null; return; }
        onDragChange(true);
        marker.focus({ preventScroll: true });
        marker.classList.add('is-cranking');
    }

    function onPointerMove(event) {
        if (!drag || event.pointerId !== drag.id) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!Number.isFinite(event.clientY)) return;
        updateValue(lift + (drag.y - event.clientY) / drag.travel);
        drag.y = event.clientY;
    }

    function cancel() {
        if (!drag) return;
        const id = drag.id;
        drag = null;
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
        marker.classList.remove('is-cranking');
        onDragChange(false);
    }

    function onPointerEnd(event) {
        if (!drag || event.pointerId !== drag.id) return;
        event.stopImmediatePropagation();
        cancel();
    }

    function onKeyDown(event) {
        if (!enabled || !marker.contains(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
        const steps = { ArrowUp: 0.025, ArrowRight: 0.025, ArrowDown: -0.025, ArrowLeft: -0.025, PageUp: 0.1, PageDown: -0.1 };
        if (!Object.hasOwn(steps, event.key) && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
        updateValue(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : lift + steps[event.key]);
    }

    const events = [
        ['pointerdown', onPointerDown], ['pointermove', onPointerMove],
        ['pointerup', onPointerEnd], ['pointercancel', onPointerEnd],
        ['lostpointercapture', onPointerEnd], ['keydown', onKeyDown],
    ];
    events.forEach(([name, handler]) => element.addEventListener(name, handler, { capture: true }));
    element.ownerDocument.defaultView.addEventListener('blur', cancel);
    updateLabel();

    return {
        update(currentLift) {
            if (disposed) return;
            updateValue(currentLift, false);
            camera.updateMatrixWorld();
            model.crankPivot.updateWorldMatrix(true, false);
            projected.set(0.15, -0.38, 0);
            model.crankPivot.localToWorld(projected).project(camera);
            const rect = element.getBoundingClientRect();
            marker.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
            marker.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
            marker.hidden = !enabled || projected.z < -1 || projected.z > 1;
        },
        setEnabled(value) {
            enabled = Boolean(value) && !disposed;
            if (!enabled) { cancel(); marker.hidden = true; }
        },
        cancel,
        dispose() {
            if (disposed) return;
            disposed = true;
            enabled = false;
            cancel();
            marker.hidden = true;
            events.forEach(([name, handler]) => element.removeEventListener(name, handler, { capture: true }));
            element.ownerDocument.defaultView.removeEventListener('blur', cancel);
        },
    };
}
