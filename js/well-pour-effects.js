const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => value * value * (3 - 2 * value);

export function createWellPourEffects(THREE, waterMaterial) {
    const group = new THREE.Group();
    group.name = 'well-pour-effects';
    group.visible = false;
    const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(-0.06, 1, 0),
        new THREE.Vector3(-0.12, -0.1, 0.05), new THREE.Vector3(-0.12, -0.42, 0.05),
    );
    const segments = 36;
    const sides = 8;
    const geometry = new THREE.TubeGeometry(curve, segments, 0.022, sides, false);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    positions.setUsage(THREE.DynamicDrawUsage);
    normals.setUsage(THREE.DynamicDrawUsage);
    const streamMaterial = waterMaterial.clone();
    streamMaterial.transparent = true;
    streamMaterial.opacity = 0.88;
    streamMaterial.roughness = 0.16;
    streamMaterial.metalness = 0.12;
    const stream = new THREE.Mesh(geometry, streamMaterial);
    stream.name = 'well-pour-stream';
    stream.visible = false;
    group.add(stream);

    const highlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xc2e7df, roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.88,
    });
    const dropletGeometry = new THREE.SphereGeometry(1, 10, 8);
    const highlights = Array.from({ length: 3 }, (_, index) => {
        const droplet = new THREE.Mesh(dropletGeometry, highlightMaterial);
        droplet.name = `well-flow-highlight-${index}`;
        group.add(droplet);
        return droplet;
    });
    const rippleGeometry = new THREE.RingGeometry(0.074, 0.081, 48);
    const ripples = Array.from({ length: 2 }, (_, index) => {
        const material = new THREE.MeshBasicMaterial({
            color: 0x8ccdc3, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
        });
        const ripple = new THREE.Mesh(rippleGeometry, material);
        ripple.name = `well-pour-ripple-${index}`;
        ripple.rotation.x = -Math.PI / 2;
        group.add(ripple);
        return ripple;
    });
    const splashes = Array.from({ length: 5 }, (_, index) => {
        const droplet = new THREE.Mesh(dropletGeometry, highlightMaterial);
        droplet.name = `well-pour-splash-${index}`;
        group.add(droplet);
        return droplet;
    });

    const landing = new THREE.Vector3();
    const point = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const radial = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, 1);
    const up = new THREE.Vector3(0, 1, 0);

    function hide() {
        group.visible = false;
        stream.visible = false;
    }

    function updateGeometry(phase, flow) {
        for (let ring = 0; ring <= segments; ring++) {
            const progress = ring / segments;
            curve.getPoint(progress, point);
            curve.getTangent(progress, tangent);
            normal.crossVectors(tangent, forward).normalize();
            binormal.crossVectors(tangent, normal).normalize();
            const pulse = 1 + Math.sin(progress * 18 - phase * 42) * 0.09;
            const radius = 0.022 * Math.sqrt(flow) * (1 - progress * 0.2) * pulse;
            for (let vertex = 0; vertex <= sides; vertex++) {
                const angle = vertex / sides * Math.PI * 2;
                radial.copy(normal).multiplyScalar(-Math.cos(angle));
                radial.addScaledVector(binormal, Math.sin(angle));
                const offset = (ring * (sides + 1) + vertex) * 3;
                radial.toArray(normals.array, offset);
                positions.array[offset] = point.x + radial.x * radius;
                positions.array[offset + 1] = point.y + radial.y * radius;
                positions.array[offset + 2] = point.z + radial.z * radius;
            }
        }
        positions.needsUpdate = true;
        normals.needsUpdate = true;
        geometry.computeBoundingSphere();
    }

    function update({ start, progress = null, flow = 0, amount = 1, surfaceY = -0.42 } = {}) {
        if (progress === null) {
            hide();
            return false;
        }
        if (![progress, flow, amount, surfaceY, start?.x, start?.y, start?.z].every(Number.isFinite)) {
            throw new TypeError('Pour effects require finite progress, volume and start coordinates.');
        }
        const phase = clamp(progress);
        const strength = clamp(flow);
        const volume = clamp(amount);
        if (phase <= 0.22 || phase >= 1 || volume <= 0.001 || start.y <= surfaceY + 0.02) {
            hide();
            return false;
        }

        group.visible = true;
        landing.set(start.x - 0.12, surfaceY, start.z + 0.055);
        const landingRadius = Math.hypot(landing.x, landing.z);
        if (landingRadius > 0.42) {
            landing.x *= 0.42 / landingRadius;
            landing.z *= 0.42 / landingRadius;
        }
        const height = start.y - surfaceY;
        curve.v0.copy(start);
        curve.v1.set(start.x - 0.055, start.y - height * 0.13, start.z + 0.01);
        curve.v2.set(landing.x, surfaceY + height * 0.2, landing.z);
        curve.v3.copy(landing);
        stream.visible = strength > 0.001;
        if (stream.visible) updateGeometry(phase, strength);

        highlights.forEach((droplet, index) => {
            droplet.visible = stream.visible;
            const travel = ((phase - 0.22) * 4.8 + index / highlights.length) % 1;
            const position = Math.pow(travel, 1.3);
            curve.getPoint(position, droplet.position);
            curve.getTangent(position, tangent);
            droplet.quaternion.setFromUnitVectors(up, tangent);
            const radius = Math.sqrt(strength) * 0.023;
            droplet.scale.set(radius * 0.72, radius * 1.65, radius * 0.72);
        });

        const activity = Math.sqrt(volume) * ease(clamp((phase - 0.25) / 0.13))
            * (1 - ease(clamp((phase - 0.77) / 0.23)));
        ripples.forEach((ripple, index) => {
            const cycle = ((phase - 0.25) * 3.6 + index * 0.5 + 1) % 1;
            ripple.position.copy(landing);
            ripple.position.y += 0.006 + index * 0.001;
            ripple.scale.setScalar(0.45 + cycle * 2.55);
            ripple.material.opacity = activity * (1 - cycle) * 0.72;
        });
        splashes.forEach((droplet, index) => {
            const cycle = ((phase - 0.28) * 4 + index * 0.19 + 1) % 1;
            const angle = index / splashes.length * Math.PI * 2 + 0.3;
            const distance = 0.025 + cycle * 0.11;
            const arc = Math.sin(cycle * Math.PI);
            droplet.position.set(
                landing.x + Math.cos(angle) * distance,
                surfaceY + 0.012 + arc * 0.13,
                landing.z + Math.sin(angle) * distance,
            );
            const radius = 0.014 * activity * arc;
            droplet.scale.set(radius, radius * 1.4, radius);
        });
        return true;
    }

    return { group, stream, landing, update };
}
