import { createWellWinding, WINDING } from './well-winding.js';
import { getPourPose, getPourWaterProgress } from './well-water-state.mjs';
import { createWellPourEffects } from './well-pour-effects.js';
import { createWellTransformationEffects } from './well-transformation-effects.js';
import { createWellCanopy } from './well-canopy.js';
import { getCourseHeight, WELL_COURSES } from './well-layout.mjs';

export function createWellScene(THREE) {
    const scene = new THREE.Scene();
    const sculpture = new THREE.Group();
    scene.add(sculpture);

    const stoneColors = [0xb5a17c, 0xcfba93, 0xa89571, 0xdbc69f];
    const stones = stoneColors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.84 }));
    const waterAccent = new THREE.MeshStandardMaterial({ color: 0x6bb5ae, metalness: 0.34, roughness: 0.3 });
    // Brushed metals retain a diffuse response without an environment texture.
    const iron = new THREE.MeshStandardMaterial({ color: 0xb89765, metalness: 0.24, roughness: 0.58, emissive: 0x80603a, emissiveIntensity: 0.12 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xe4c18d, metalness: 0.45, roughness: 0.42, emissive: 0x80603a, emissiveIntensity: 0.08 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0xb88c53, metalness: 0.32, roughness: 0.48, emissive: 0x80603a, emissiveIntensity: 0.1 });
    const flax = new THREE.MeshStandardMaterial({ color: 0xd3b783, metalness: 0, roughness: 0.92 });

    function mesh(geometry, material, parent, position = [0, 0, 0]) {
        const item = new THREE.Mesh(geometry, material);
        item.position.set(...position);
        item.castShadow = true;
        item.receiveShadow = true;
        parent.add(item);
        return item;
    }

    function beam(from, to, radius, material, parent) {
        const start = new THREE.Vector3(...from);
        const end = new THREE.Vector3(...to);
        const direction = end.clone().sub(start);
        const item = mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 16), material, parent);
        item.position.copy(start).add(end).multiplyScalar(0.5);
        item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        return item;
    }

    function stoneArc(start, end, outer, inner, height) {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, outer, start, end, false);
        shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner);
        shape.absarc(0, 0, inner, end, start, true);
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: height, bevelEnabled: true, bevelSegments: 2,
            steps: 1, bevelSize: 0.017, bevelThickness: Math.min(0.018, height * 0.08), curveSegments: 12,
        });
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    const courses = Array.from({ length: WELL_COURSES.count }, (_, layer) => {
        const group = new THREE.Group();
        group.name = `well-course-${layer}`;
        sculpture.add(group);
        const sections = 10;
        const width = Math.PI * 2 / sections;
        for (let segment = 0; segment < sections; segment++) {
            const start = segment * width + (layer % 2) * width / 2;
            const radius = layer === WELL_COURSES.count - 1 ? 1.23 : 1.16;
            const geometry = stoneArc(start + 0.007, start + width - 0.007, radius, 0.8, getCourseHeight(layer));
            mesh(geometry, stones[(segment + layer) % stones.length], group);
        }
        return group;
    });

    const base = mesh(new THREE.CylinderGeometry(1.17, 1.2, 0.045, 64), iron, sculpture, [0, -0.85, 0]);
    base.receiveShadow = true;
    const water = mesh(new THREE.CylinderGeometry(0.79, 0.79, 0.025, 64), waterAccent, sculpture, [0, -0.4325, 0]);
    water.name = 'well-water';
    water.material = waterAccent.clone();
    water.material.roughness = 0.18;
    water.material.metalness = 0.4;

    const winch = new THREE.Group();
    winch.name = 'well-winch';
    sculpture.add(winch);
    winch.add(createWellCanopy(THREE));
    for (const side of [-1, 1]) {
        mesh(new THREE.BoxGeometry(0.105, 1.18, 0.15), iron, winch, [side * 1.015, 0.53, 0]);
        mesh(new THREE.BoxGeometry(0.29, 0.055, 0.34), iron, winch, [side * 1.015, -0.055, 0]);
        beam([side * 1.015, 0, 0.38], [side * 1.015, 0.48, 0], 0.024, iron, winch);
        for (const z of [-0.105, 0.105]) {
            mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.035, 6), silver, winch, [side * 1.015, -0.014, z]);
        }
    }
    const windingShaft = new THREE.Group();
    windingShaft.name = 'well-winding-shaft';
    windingShaft.position.y = 1.06;
    winch.add(windingShaft);
    beam([-1.14, 0, 0], [1.29, 0, 0], 0.068, silver, windingShaft);
    beam([-0.23, 0, 0], [0.23, 0, 0], 0.135, bronze, windingShaft);
    for (const x of [-0.25, 0.25]) {
        beam([x - 0.024, 0, 0], [x + 0.024, 0, 0], 0.19, iron, windingShaft);
    }
    const winding = createWellWinding(THREE, flax);
    windingShaft.add(winding.mesh);
    beam([1.29, 0, 0], [1.29, -0.38, 0], 0.045, iron, windingShaft);
    const crankGrip = beam([1.29, -0.38, 0], [1.59, -0.38, 0], 0.085, bronze, windingShaft);
    crankGrip.name = 'well-crank-grip';
    const crankPivot = new THREE.Object3D();
    crankPivot.name = 'well-crank-pivot';
    crankPivot.position.set(1.29, 1.06, 0);
    winch.add(crankPivot);

    const bucket = new THREE.Group();
    bucket.name = 'well-bucket';
    bucket.position.z = -WINDING.radius;
    sculpture.add(bucket);
    const bucketPivot = new THREE.Group();
    bucketPivot.name = 'well-bucket-pour-pivot';
    bucketPivot.position.y = 0.465;
    bucket.add(bucketPivot);
    const bucketContents = new THREE.Group();
    bucketContents.position.y = -0.465;
    bucketPivot.add(bucketContents);
    const bucketShape = new THREE.LatheGeometry([
        new THREE.Vector2(0.18, 0), new THREE.Vector2(0.245, 0.29),
        new THREE.Vector2(0.225, 0.29), new THREE.Vector2(0.16, 0.025),
        new THREE.Vector2(0, 0.025), new THREE.Vector2(0, 0),
    ], 40);
    const bucketBody = mesh(bucketShape, bronze, bucketContents);
    bucketBody.name = 'well-bucket-body';
    const bucketWater = mesh(new THREE.CylinderGeometry(0.213, 0.213, 0.008, 40), water.material, bucketContents, [0, 0.268, 0]);
    bucketWater.name = 'well-bucket-water';
    bucketWater.visible = false;
    const lip = mesh(new THREE.TorusGeometry(0.235, 0.018, 8, 40), silver, bucketContents, [0, 0.295, 0]);
    lip.name = 'well-bucket-lip';
    lip.rotation.x = Math.PI / 2;
    const handle = mesh(new THREE.TorusGeometry(0.22, 0.014, 8, 32, Math.PI), iron, bucketContents, [0, 0.245, 0]);
    handle.name = 'well-bucket-handle';
    handle.rotation.y = Math.PI / 7;
    const bucketTarget = new THREE.Object3D();
    bucketTarget.name = 'well-bucket-target';
    bucketTarget.position.y = 0.16;
    bucketContents.add(bucketTarget);

    const pourEffects = createWellPourEffects(THREE, water.material);
    sculpture.add(pourEffects.group);
    const spillPoint = new THREE.Vector3();
    const transformation = createWellTransformationEffects(THREE);
    sculpture.add(transformation.group);

    const rope = mesh(new THREE.CylinderGeometry(WINDING.ropeRadius, WINDING.ropeRadius, 1, 10), flax, sculpture, [0, 0.5, -WINDING.radius]);
    rope.name = 'well-rope';
    const anchor = new THREE.Vector3(0, 0, -WINDING.radius);

    const ground = mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.2 }), scene, [0, -0.915, 0]);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;

    const circlePoints = Array.from({ length: 129 }, (_, index) => {
        const angle = index / 128 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * 1.53, -0.905, Math.sin(angle) * 1.53);
    });
    const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints), new THREE.LineDashedMaterial({
        color: 0xa5804d, dashSize: 0.045, gapSize: 0.055, transparent: true, opacity: 0.35,
    }));
    guide.computeLineDistances();
    scene.add(guide);

    scene.add(new THREE.HemisphereLight(0xffecd1, 0x786c5b, 1.9));
    const key = new THREE.DirectionalLight(0xffe2ad, 4.2);
    key.position.set(-2, 12, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -3;
    key.shadow.normalBias = 0.04;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe9cb, 1.8);
    rim.position.set(3, 3, -4);
    scene.add(rim);
    // Opposing soft fills keep the crank and supports readable through a full orbit.
    for (const position of [[4, 2, 5], [-5, 2, -3]]) {
        const fill = new THREE.DirectionalLight(0xffefd8, 0.8);
        fill.position.set(...position);
        scene.add(fill);
    }

    return {
        scene,
        sculpture,
        crankGrip,
        crankPivot,
        bucketTarget,
        bucketBody,
        bucketHitMeshes: [bucketBody, lip, handle],
        updateTransformation: transformation.update,
        projectDelivery: transformation.project,
        update(layout, waterState = { fill: 0, pourProgress: null }) {
            courses.forEach((course, index) => {
                course.position.y = layout.courses[index];
                course.rotation.y = layout.twists[index];
            });
            winch.position.y = layout.winch;
            windingShaft.rotation.x = layout.crankAngle;
            const ropeExit = winding.update(layout.crankAngle);
            bucket.position.x = ropeExit.x;
            bucket.position.y = layout.bucket;
            rope.scale.y = layout.ropeLength;
            anchor.x = ropeExit.x;
            anchor.y = layout.ropeBottom + layout.ropeLength / 2;
            rope.position.copy(anchor);

            const fill = Math.max(0, Math.min(1, waterState.fill));
            const pour = getPourPose(waterState.pourProgress);
            bucketPivot.rotation.z = pour.tip;
            bucketWater.visible = fill > 0.001;
            bucketWater.position.y = 0.035 + fill * 0.233;
            bucketWater.scale.setScalar(0.78 + fill * 0.22);
            const flow = pour.stream * (waterState.pourStartFill ?? fill);
            const spillX = -0.235 * Math.cos(pour.tip) + 0.17 * Math.sin(pour.tip);
            const spillY = -0.235 * Math.sin(pour.tip) - 0.17 * Math.cos(pour.tip);
            spillPoint.set(ropeExit.x + spillX, layout.bucket + 0.465 + spillY, -WINDING.radius);
            pourEffects.update({
                start: spillPoint, progress: getPourWaterProgress(waterState.pourProgress), flow,
                amount: waterState.pourStartFill ?? fill,
                surfaceY: water.position.y + water.geometry.parameters.height / 2,
            });
        },
        dispose() {
            const geometries = new Set();
            const materials = new Set();
            scene.traverse((object) => {
                if (object.isInstancedMesh) object.dispose();
                if (object.geometry) geometries.add(object.geometry);
                if (object.material) materials.add(object.material);
            });
            geometries.forEach((geometry) => geometry.dispose());
            materials.forEach((material) => material.dispose());
            key.shadow.dispose();
        },
    };
}
