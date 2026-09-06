import { Raycaster, Vector2, Vector3 } from '../vendor/three/three.module.min.js';

export function createBucketPourControl(model, camera, element, { onPour, onDragChange }) {
    const marker = element.ownerDocument.getElementById('wellPour');
    if (!marker || !model.bucketTarget) return { update() {}, setEnabled() {}, cancel() {}, dispose() {} };
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const projected = new Vector3();
    let enabled = true;
    let canPour = false;
    let gesture = null;
    let suppressClick = null;
    let disposed = false;

    function isBucket(event) {
        if (marker.contains(event.target)) return true;
        if (event.target.closest?.('button, [role="slider"]')) return false;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return false;
        pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        camera.updateMatrixWorld();
        model.sculpture.updateWorldMatrix(true, true);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(model.bucketHitMeshes ?? [], false).length > 0;
    }

    function consume(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function hideMarker() {
        if (element.ownerDocument.activeElement === marker) element.focus({ preventScroll: true });
        marker.hidden = true;
        marker.disabled = true;
    }

    function cancel() {
        if (!gesture) return;
        const id = gesture.id;
        suppressClick = { id, until: Date.now() + 800 };
        gesture = null;
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
        onDragChange(false);
    }

    function onPointerDown(event) {
        if (!enabled || !canPour || gesture || event.isPrimary === false || event.button !== 0 || !isBucket(event)) return;
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
        consume(event);
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        try { element.setPointerCapture(event.pointerId); }
        catch { gesture = null; return; }
        onDragChange(true);
        marker.focus({ preventScroll: true });
    }

    function recordMovement(event) {
        if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) { gesture.moved = true; return; }
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
    }

    function onPointerMove(event) {
        if (!gesture || gesture.id !== event.pointerId) return;
        consume(event);
        recordMovement(event);
    }

    function onPointerUp(event) {
        if (!gesture || gesture.id !== event.pointerId) return;
        consume(event);
        recordMovement(event);
        const activate = enabled && canPour && !gesture.moved;
        suppressClick = { id: event.pointerId, until: Date.now() + 800 };
        cancel();
        if (activate) onPour();
    }

    function onPointerCancel(event) {
        if (!gesture || gesture.id !== event.pointerId) return;
        event.stopImmediatePropagation();
        suppressClick = { id: event.pointerId, until: Date.now() + 800 };
        cancel();
    }

    function onClick(event) {
        // Pointer release already handled the action; native keyboard clicks have detail 0.
        if (event.detail > 0 && suppressClick && Date.now() <= suppressClick.until
            && (event.pointerId === undefined || event.pointerId === suppressClick.id)) {
            consume(event);
            suppressClick = null;
            return;
        }
        if (!enabled || !canPour || !marker.contains(event.target)) return;
        consume(event);
        cancel();
        onPour();
    }

    const events = [
        ['pointerdown', onPointerDown], ['pointermove', onPointerMove], ['pointerup', onPointerUp],
        ['pointercancel', onPointerCancel], ['lostpointercapture', onPointerCancel], ['click', onClick],
    ];
    events.forEach(([name, handler]) => element.addEventListener(name, handler, { capture: true }));
    element.ownerDocument.defaultView.addEventListener('blur', cancel);

    return {
        update(value) {
            if (disposed) return;
            canPour = Boolean(value);
            if (!canPour) cancel();
            camera.updateMatrixWorld();
            model.bucketTarget.getWorldPosition(projected).project(camera);
            const rect = element.getBoundingClientRect();
            marker.style.left = `${(projected.x * 0.5 + 0.5) * rect.width}px`;
            marker.style.top = `${(-projected.y * 0.5 + 0.5) * rect.height}px`;
            if (!enabled || !canPour || projected.z < -1 || projected.z > 1) hideMarker();
            else { marker.disabled = false; marker.hidden = false; }
        },
        setEnabled(value) {
            enabled = Boolean(value) && !disposed;
            if (!enabled) { cancel(); hideMarker(); }
        },
        cancel,
        dispose() {
            if (disposed) return;
            disposed = true;
            enabled = false;
            cancel();
            hideMarker();
            events.forEach(([name, handler]) => element.removeEventListener(name, handler, { capture: true }));
            element.ownerDocument.defaultView.removeEventListener('blur', cancel);
        },
    };
}
