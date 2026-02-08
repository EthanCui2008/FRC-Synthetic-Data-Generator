import * as THREE from 'three';

export class Exporter {
    constructor(camera, renderer, scene) {
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;

        // Class definitions for YOLO format
        this.classes = ['game_piece'];

        // Reusable objects
        this._frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        this._raycaster = new THREE.Raycaster();
    }

    /**
     * Get the object's world center position
     */
    getObjectWorldCenter(object) {
        const bbox = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        return center;
    }

    /**
     * Get the object's effective radius (maximum dimension / 2)
     */
    getObjectWorldRadius(object) {
        const bbox = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        return Math.max(size.x, size.y, size.z) / 2;
    }

    /**
     * Check if an object is fully occluded by other objects in the scene.
     * Uses a single ray from camera to object center.
     * Returns true if the object is fully occluded (should NOT be labeled).
     */
    isFullyOccluded(object) {
        const center = this.getObjectWorldCenter(object);
        const worldRadius = this.getObjectWorldRadius(object);
        const cameraPos = this.camera.position.clone();

        // Vector from camera to object center
        const toCenter = center.clone().sub(cameraPos);
        const distanceToCenter = toCenter.length();

        // Can't be occluded if camera is inside
        if (distanceToCenter < worldRadius) {
            return false;
        }

        // Cast ray from camera toward object center
        const rayDir = toCenter.clone().normalize();
        this._raycaster.set(cameraPos, rayDir);
        this._raycaster.far = distanceToCenter + worldRadius;

        // Get all intersections
        const intersects = this._raycaster.intersectObjects(this.scene.children, true);

        for (const hit of intersects) {
            // Skip if we hit the object itself or any of its children
            let isPartOfTarget = false;
            object.traverse(child => {
                if (child === hit.object) {
                    isPartOfTarget = true;
                }
            });

            if (isPartOfTarget) {
                continue;
            }

            // If something is hit before reaching the object's front surface, it's occluded
            if (hit.distance < distanceToCenter - worldRadius) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get the screen-space bounding box for any object by sampling
     * points from its bounding box corners and projecting them.
     */
    getObjectBoundingBox(object) {
        // Ensure matrices are current
        object.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        this.camera.updateProjectionMatrix();

        // Get object's world bounding box
        const bbox = new THREE.Box3().setFromObject(object);

        // Get the 8 corners of the bounding box
        const corners = [
            new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z),
            new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.max.z),
            new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.min.z),
            new THREE.Vector3(bbox.min.x, bbox.max.y, bbox.max.z),
            new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.min.z),
            new THREE.Vector3(bbox.max.x, bbox.min.y, bbox.max.z),
            new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.min.z),
            new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z),
        ];

        // Project all corners to screen space
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasValidPoint = false;

        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);
        const cameraPos = this.camera.position.clone();

        for (const corner of corners) {
            // Check if point is in front of camera
            const toPoint = corner.clone().sub(cameraPos);
            const dotProduct = toPoint.dot(cameraDir);

            if (dotProduct < this.camera.near) {
                continue; // Skip points behind camera
            }

            // Project to NDC
            const projected = corner.clone().project(this.camera);

            // Convert from NDC (-1 to 1) to normalized screen coordinates (0 to 1)
            const screenX = (projected.x + 1) / 2;
            const screenY = (1 - projected.y) / 2;

            // Track min/max
            minX = Math.min(minX, screenX);
            maxX = Math.max(maxX, screenX);
            minY = Math.min(minY, screenY);
            maxY = Math.max(maxY, screenY);
            hasValidPoint = true;
        }

        if (!hasValidPoint) {
            return null; // Object not visible
        }

        // Clamp to [0, 1] range
        minX = Math.max(0, Math.min(1, minX));
        maxX = Math.max(0, Math.min(1, maxX));
        minY = Math.max(0, Math.min(1, minY));
        maxY = Math.max(0, Math.min(1, maxY));

        const width = maxX - minX;
        const height = maxY - minY;

        // Skip if box is too small or invalid
        if (width <= 0 || height <= 0) {
            return null;
        }

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        return { centerX, centerY, width, height };
    }

    /**
     * LEGACY: Get the exact screen-space bounding box for a sphere mesh by sampling
     * points on the sphere's silhouette edge as seen from the camera.
     * Kept for reference but replaced by getObjectBoundingBox.
     */
    getSphereBoundingBox(sphereMesh) {
        // Ensure matrices are current
        sphereMesh.updateMatrixWorld(true);
        this.camera.updateMatrixWorld(true);
        this.camera.updateProjectionMatrix();

        // Get sphere parameters
        const center = this.getSphereWorldCenter(sphereMesh);
        const worldRadius = this.getSphereWorldRadius(sphereMesh);

        // Get camera info
        const cameraPos = this.camera.position.clone();
        const cameraDir = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDir);

        // Vector from camera to sphere center
        const toCenter = center.clone().sub(cameraPos);
        const distanceToCenter = toCenter.length();

        // Check if camera is inside sphere
        if (distanceToCenter < worldRadius) {
            return null;
        }

        // Check if sphere is behind camera
        const depth = toCenter.dot(cameraDir);
        if (depth + worldRadius < this.camera.near) {
            return null;
        }

        // For a sphere viewed from outside, the visible silhouette is a circle.
        const r = worldRadius;
        const d = distanceToCenter;

        // Distance from sphere center to silhouette plane (along view vector)
        const ds = (r * r) / d;

        // Radius of the silhouette circle
        const rs = r * Math.sqrt(d * d - r * r) / d;

        // Silhouette center in world space
        const silhouetteCenter = cameraPos.clone().add(toCenter.clone().normalize().multiplyScalar(d - ds));

        // We need two perpendicular vectors in the silhouette plane
        const viewToSphere = toCenter.clone().normalize();

        let perpX = new THREE.Vector3();
        let perpY = new THREE.Vector3();

        const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

        perpX.crossVectors(camUp, viewToSphere);
        if (perpX.lengthSq() < 0.001) {
            const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
            perpX.crossVectors(camRight, viewToSphere);
        }
        perpX.normalize();

        perpY.crossVectors(viewToSphere, perpX).normalize();

        // Sample points around the silhouette circle and project them
        const numSamples = 32;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasValidPoint = false;

        for (let i = 0; i < numSamples; i++) {
            const angle = (i / numSamples) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            const point = silhouetteCenter.clone()
                .add(perpX.clone().multiplyScalar(rs * cos))
                .add(perpY.clone().multiplyScalar(rs * sin));

            const projected = point.clone().project(this.camera);

            if (projected.z >= -1 && projected.z <= 1) {
                const nx = (projected.x + 1) / 2;
                const ny = (1 - projected.y) / 2;

                minX = Math.min(minX, nx);
                maxX = Math.max(maxX, nx);
                minY = Math.min(minY, ny);
                maxY = Math.max(maxY, ny);
                hasValidPoint = true;
            }
        }

        const centerProjected = center.clone().project(this.camera);
        if (centerProjected.z >= -1 && centerProjected.z <= 1) {
            hasValidPoint = true;
        }

        if (!hasValidPoint) {
            return null;
        }

        if (maxX < 0 || minX > 1 || maxY < 0 || minY > 1) {
            return null;
        }

        minX = Math.max(0, minX);
        maxX = Math.min(1, maxX);
        minY = Math.max(0, minY);
        maxY = Math.min(1, maxY);

        const width = maxX - minX;
        const height = maxY - minY;

        if (width < 0.0005 || height < 0.0005) {
            return null;
        }

        return { minX, minY, maxX, maxY, width, height };
    }

    /**
     * Check if an object is within the camera frustum
     */
    isInFrustum(obj) {
        this.camera.updateMatrixWorld();
        this._projScreenMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        this._frustum.setFromProjectionMatrix(this._projScreenMatrix);

        const boundingSphere = new THREE.Sphere();
        const box = new THREE.Box3().setFromObject(obj);
        box.getBoundingSphere(boundingSphere);

        return this._frustum.intersectsSphere(boundingSphere);
    }

    /**
     * Convert 3D sphere to YOLO format bounding box
     */
    toYOLOFormat(obj) {
        if (!this.isInFrustum(obj)) {
            return null;
        }

        // Check if fully occluded by field geometry or other objects
        if (this.isFullyOccluded(obj)) {
            return null;
        }

        const bbox = this.getObjectBoundingBox(obj);

        if (!bbox) {
            return null;
        }

        return {
            class_id: 0,
            x_center: bbox.centerX,
            y_center: bbox.centerY,
            width: bbox.width,
            height: bbox.height
        };
    }

    /**
     * Convert YOLO detection to label string format
     */
    toYOLOString(detection) {
        return `${detection.class_id} ${detection.x_center.toFixed(6)} ${detection.y_center.toFixed(6)} ${detection.width.toFixed(6)} ${detection.height.toFixed(6)}`;
    }

    /**
     * Generate data.yaml content for YOLO dataset
     */
    generateDataYaml(imageCount) {
        let yaml = `# YOLO Dataset Configuration
# Generated by FRC Synthetic Data Generator

path: .  # dataset root dir
train: images

# Classes
names:`;
        this.classes.forEach((name, idx) => {
            yaml += `\n  ${idx}: ${name}`;
        });

        yaml += `

# Number of classes
nc: ${this.classes.length}

# Dataset info
# images: ${imageCount}`;

        return yaml;
    }

    /**
     * Generate labels for a single frame in YOLO .txt format
     */
    generateLabels(spawnedObjects) {
        this.camera.updateMatrixWorld(true);
        this.camera.updateProjectionMatrix();

        const detections = spawnedObjects
            .map(obj => this.toYOLOFormat(obj))
            .filter(res => res !== null);

        return detections.map(d => this.toYOLOString(d)).join('\n');
    }

    /**
     * Generate a YOLO dataset (flat structure: images/ and labels/)
     */
    async generateYOLODataset(generateFrame, count, onProgress = null) {
        const zip = new JSZip();

        const imagesFolder = zip.folder('images');
        const labelsFolder = zip.folder('labels');

        for (let i = 0; i < count; i++) {
            const { imageData, labels } = await generateFrame();
            const filename = `image_${String(i).padStart(6, '0')}`;
            imagesFolder.file(`${filename}.png`, imageData, { base64: true });
            labelsFolder.file(`${filename}.txt`, labels);
            if (onProgress) onProgress(i + 1, count);
        }

        zip.file('data.yaml', this.generateDataYaml(count));

        return zip;
    }
}
