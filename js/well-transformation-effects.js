const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => value * value * (3 - 2 * value);

export function createWellTransformationEffects(THREE) {
    const count = 40;
    const appWidth = 3.1;
    const appHeight = appWidth * 160 / 260;
    const group = new THREE.Group();
    group.name = 'well-transformation';
    group.visible = false;
    const anchor = new THREE.Object3D();
    anchor.name = 'well-delivery-anchor';
    anchor.position.set(0, 3.35, 0);
    group.add(anchor);

    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.94,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const particles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
    particles.name = 'well-software-particles';
    particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particles.frustumCulled = false;
    group.add(particles);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x8fd8d0, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.414, 64), ringMaterial);
    ring.name = 'well-transformation-ring';
    ring.position.y = -0.413;
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const light = new THREE.PointLight(0x91dbca, 0, 2.4, 2);
    light.position.set(0, -0.1, 0);
    group.add(light);

    const seeds = Array.from({ length: count }, (_, index) => ({
        angle: index * 2.399963,
        radius: 0.13 + ((index * 73 + 19) % 101) / 101 * 0.22,
        delay: ((index * 37) % count) / count,
        size: 0.036 + ((index * 29) % 13) / 13 * 0.03,
        x: (index % 8 / 7 - 0.5) * appWidth,
        y: (0.5 - Math.floor(index / 8) / 4) * appHeight,
    }));
    const dummy = new THREE.Object3D();
    const destination = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    const inverseRotation = new THREE.Quaternion();
    const projected = new THREE.Vector3();
    const waterColor = new THREE.Color(0x9de4d9);
    const amberColor = new THREE.Color(0xffbd6b);
    const creamColor = new THREE.Color(0xffebc4);
    const color = new THREE.Color();
    for (let index = 0; index < count; index++) particles.setColorAt(index, waterColor);
    particles.instanceColor.setUsage(THREE.DynamicDrawUsage);

    function update(phase, hasDelivery, camera, reducedMotion = false) {
        if (phase !== null && !Number.isFinite(phase)) throw new TypeError('Transformation phase must be finite or null.');
        if (!hasDelivery || phase === null || reducedMotion || phase <= 0.14 || phase >= 0.96) {
            group.visible = false;
            light.intensity = 0;
            return false;
        }
        if (!camera?.isCamera) throw new TypeError('Transformation requires a Three.js camera.');
        const progress = clamp(phase);
        camera.updateMatrixWorld();
        group.updateWorldMatrix(true, false);
        group.getWorldQuaternion(inverseRotation).invert();
        cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).applyQuaternion(inverseRotation).normalize();
        cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).applyQuaternion(inverseRotation).normalize();
        group.visible = true;

        for (let index = 0; index < count; index++) {
            const seed = seeds[index];
            const birth = 0.16 + seed.delay * 0.055;
            const rise = ease(clamp((progress - birth) / 0.36));
            const converge = ease(clamp((progress - 0.4 - seed.delay * 0.025) / 0.355));
            const angle = seed.angle + rise * Math.PI * 3.5;
            const radius = seed.radius * (1 - rise * 0.2) + Math.sin(rise * Math.PI) * 0.2;
            dummy.position.set(
                Math.cos(angle) * radius,
                -0.41 + rise * (anchor.position.y + 0.41 + seed.delay * 0.22),
                Math.sin(angle) * radius,
            );
            destination.copy(anchor.position).addScaledVector(cameraRight, seed.x).addScaledVector(cameraUp, seed.y);
            dummy.position.lerp(destination, converge);
            const appear = ease(clamp((progress - birth) / 0.055));
            const absorbed = 1 - ease(clamp((progress - 0.7 - seed.delay * 0.025) / 0.09));
            let size = seed.size * appear * absorbed;
            if (progress >= 0.8) {
                const sparkle = Math.sin(clamp((progress - 0.8) / 0.15) * Math.PI);
                const isEdge = index % 8 === 0 || index % 8 === 7;
                size = isEdge ? seed.size * sparkle * 1.35 : 0;
                dummy.position.copy(destination).addScaledVector(cameraRight, Math.sign(seed.x) * 0.07);
            }
            dummy.rotation.set(progress * 9 + seed.angle, progress * 13 + seed.delay, progress * 7);
            dummy.scale.setScalar(Math.max(0, size));
            dummy.updateMatrix();
            particles.setMatrixAt(index, dummy.matrix);
            color.copy(waterColor).lerp(index % 4 === 0 ? creamColor : amberColor, converge * 0.9);
            particles.setColorAt(index, color);
        }
        particles.instanceMatrix.needsUpdate = true;
        particles.instanceColor.needsUpdate = true;
        const charge = Math.sin(clamp((progress - 0.14) / 0.44) * Math.PI);
        ringMaterial.opacity = charge * 0.48;
        ring.scale.setScalar(0.85 + charge * 0.42);
        light.intensity = charge * 0.65;
        return true;
    }

    function project(camera, width, height) {
        if (!camera?.isCamera) throw new TypeError('Delivery projection requires a Three.js camera.');
        if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
            throw new RangeError('Delivery projection requires positive finite dimensions.');
        }
        camera.updateMatrixWorld();
        anchor.getWorldPosition(projected).project(camera);
        return {
            x: (projected.x * 0.5 + 0.5) * width,
            y: (-projected.y * 0.5 + 0.5) * height,
            width: appWidth * width / (camera.right - camera.left),
        };
    }

    return { group, anchor, particles, update, project };
}
