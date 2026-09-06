export function createWellCanopy(THREE) {
    const constructors = ['Group', 'Mesh', 'MeshStandardMaterial', 'BoxGeometry', 'CylinderGeometry', 'Vector3'];
    if (!THREE || constructors.some((name) => typeof THREE[name] !== 'function')) {
        throw new TypeError('The well canopy requires the Three.js mesh, geometry and material APIs.');
    }

    const canopy = new THREE.Group();
    canopy.name = 'well-canopy';
    const frame = new THREE.MeshStandardMaterial({
        color: 0xd4ad73, metalness: 0.32, roughness: 0.5,
        emissive: 0x80603a, emissiveIntensity: 0.12,
    });
    const caps = new THREE.MeshStandardMaterial({
        color: 0xe4c18d, metalness: 0.4, roughness: 0.5,
        emissive: 0x9a7443, emissiveIntensity: 0.1,
    });
    const glazing = new THREE.MeshStandardMaterial({
        color: 0xd1ae76, metalness: 0.25, roughness: 0.5,
        emissive: 0x8d6a3e, emissiveIntensity: 0.08,
        transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
    });

    function mesh(name, geometry, material, position) {
        const item = new THREE.Mesh(geometry, material);
        item.name = name;
        item.position.set(...position);
        item.castShadow = material !== glazing;
        item.receiveShadow = material !== glazing;
        canopy.add(item);
        return item;
    }

    function rib(name, from, to, radius, material = frame) {
        const start = new THREE.Vector3(...from);
        const end = new THREE.Vector3(...to);
        const direction = end.clone().sub(start);
        const item = mesh(name, new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material,
            start.clone().add(end).multiplyScalar(0.5).toArray());
        item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        return item;
    }

    const halfWidth = 1.4;
    const halfDepth = 1.1;
    const eaveHeight = 1.62;
    const ridgeHeight = 1.98;
    const rise = ridgeHeight - eaveHeight;
    const slopeLength = Math.hypot(halfDepth, rise);

    // The two continuous panels cover the opening; translucency exposes the working mechanism.
    for (const side of [-1, 1]) {
        const label = side === -1 ? 'rear' : 'front';
        const panel = mesh(`well-canopy-panel-${label}`,
            new THREE.BoxGeometry(halfWidth * 2, 0.018, slopeLength), glazing,
            [0, (ridgeHeight + eaveHeight) / 2, side * halfDepth / 2]);
        panel.rotation.x = side * Math.atan2(rise, halfDepth);
        panel.renderOrder = 1;
        rib(`well-canopy-eave-${label}`, [-halfWidth, eaveHeight, side * halfDepth],
            [halfWidth, eaveHeight, side * halfDepth], 0.024, caps);
    }

    for (const side of [-1, 1]) {
        const label = side === -1 ? 'left' : 'right';
        mesh(`well-canopy-post-${label}`, new THREE.BoxGeometry(0.105, ridgeHeight - 1.1, 0.15), frame,
            [side * 1.015, (ridgeHeight + 1.1) / 2, 0]);
        for (const depth of [-1, 1]) {
            const edge = depth === -1 ? 'rear' : 'front';
            rib(`well-canopy-rafter-${label}-${edge}`, [side * halfWidth, ridgeHeight, 0],
                [side * halfWidth, eaveHeight, depth * halfDepth], 0.022, caps);
            rib(`well-canopy-support-${label}-${edge}`, [side * 1.015, ridgeHeight - 0.02, 0],
                [side * 1.015, eaveHeight, depth * halfDepth], 0.019);
        }
    }
    rib('well-canopy-ridge', [-halfWidth - 0.035, ridgeHeight, 0],
        [halfWidth + 0.035, ridgeHeight, 0], 0.034, caps);
    return canopy;
}
