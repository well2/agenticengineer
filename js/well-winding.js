export const WINDING = Object.freeze({
    radius: 0.149,
    ropeRadius: 0.014,
    pitch: 0.055,
    startX: -0.0825,
    baseTurns: 1,
    travelTurns: 2,
});

export function createWellWinding(THREE, material) {
    const totalTurns = WINDING.baseTurns + WINDING.travelTurns;
    const totalAngle = totalTurns * Math.PI * 2;
    const maximumCrankAngle = WINDING.travelTurns * Math.PI * 2;
    const tubularSegments = totalTurns * 96;
    const radialSegments = 8;
    const ringValues = (radialSegments + 1) * 3;

    class WindingCurve extends THREE.Curve {
        getPoint(progress, target = new THREE.Vector3()) {
            const angle = progress * totalAngle;
            return target.set(
                WINDING.startX + WINDING.pitch * angle / (Math.PI * 2),
                -WINDING.radius * Math.sin(angle),
                -WINDING.radius * Math.cos(angle),
            );
        }

        getTangent(progress, target = new THREE.Vector3()) {
            const angle = progress * totalAngle;
            return target.set(
                WINDING.pitch / (Math.PI * 2),
                -WINDING.radius * Math.cos(angle),
                WINDING.radius * Math.sin(angle),
            ).normalize();
        }

        // A constant-pitch helix has constant speed, so arc-length sampling is exact.
        getPointAt(progress, target) { return this.getPoint(progress, target); }
        getTangentAt(progress, target) { return this.getTangent(progress, target); }
    }

    const curve = new WindingCurve();
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, WINDING.ropeRadius, radialSegments, false);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    positions.setUsage(THREE.DynamicDrawUsage);
    normals.setUsage(THREE.DynamicDrawUsage);
    const originalPositions = positions.array.slice();
    const originalNormals = normals.array.slice();
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'well-wound-rope';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const endCap = new THREE.Mesh(new THREE.SphereGeometry(WINDING.ropeRadius, 12, 8), material);
    endCap.name = 'well-wound-rope-end';
    endCap.castShadow = true;
    mesh.add(endCap);

    const endpoint = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const frameNormal = new THREE.Vector3();
    const frameBinormal = new THREE.Vector3();
    const radialNormal = new THREE.Vector3();
    let previousRing = -1;
    let previousAngle = null;

    function update(crankAngle) {
        if (!Number.isFinite(crankAngle)) throw new TypeError('Winding angle must be a finite number.');
        const angle = Math.max(0, Math.min(maximumCrankAngle, crankAngle));
        if (angle === previousAngle) return endpoint;

        if (previousRing >= 0) {
            const offset = previousRing * ringValues;
            positions.array.set(originalPositions.subarray(offset, offset + ringValues), offset);
            normals.array.set(originalNormals.subarray(offset, offset + ringValues), offset);
        }

        const progress = (WINDING.baseTurns * Math.PI * 2 + angle) / totalAngle;
        const segmentPosition = progress * tubularSegments;
        const finalRing = Math.min(tubularSegments, Math.ceil(segmentPosition - 1e-9));
        const lowerRing = Math.min(tubularSegments - 1, Math.floor(segmentPosition));
        const fraction = Math.min(1, segmentPosition - lowerRing);
        curve.getPoint(progress, endpoint);
        curve.getTangent(progress, tangent);
        frameNormal.copy(geometry.normals[lowerRing]).lerp(geometry.normals[lowerRing + 1], fraction);
        frameNormal.addScaledVector(tangent, -frameNormal.dot(tangent)).normalize();
        frameBinormal.crossVectors(tangent, frameNormal).normalize();

        for (let vertex = 0; vertex <= radialSegments; vertex++) {
            const angleAroundRope = vertex / radialSegments * Math.PI * 2;
            radialNormal.copy(frameNormal).multiplyScalar(-Math.cos(angleAroundRope));
            radialNormal.addScaledVector(frameBinormal, Math.sin(angleAroundRope)).normalize();
            const offset = finalRing * ringValues + vertex * 3;
            radialNormal.toArray(normals.array, offset);
            positions.array[offset] = endpoint.x + WINDING.ropeRadius * radialNormal.x;
            positions.array[offset + 1] = endpoint.y + WINDING.ropeRadius * radialNormal.y;
            positions.array[offset + 2] = endpoint.z + WINDING.ropeRadius * radialNormal.z;
        }

        geometry.setDrawRange(0, finalRing * radialSegments * 6);
        positions.needsUpdate = true;
        normals.needsUpdate = true;
        endCap.position.copy(endpoint);
        previousRing = finalRing;
        previousAngle = angle;
        return endpoint;
    }

    update(0);
    return { mesh, update, endpoint };
}
