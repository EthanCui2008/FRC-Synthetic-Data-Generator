import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Spawner {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();
        this.raycaster = new THREE.Raycaster();
        this.downVector = new THREE.Vector3(0, -1, 0);
        
        this.gameFieldMesh = null;
        this.pieces = []; 
        this.spawnedInstances = [];
    }

    /**
     * Loads the field GLTF, but generates Spheres programmatically.
     * @param {string} fieldUrl - Path to the game field GLTF
     * @param {Object} pieceConfig - Configuration for sphere generation
     */
    async loadAssets(fieldUrl, pieceConfig = { count: 1, radius: 0.1 }) {
        try {
            const fieldGLTF = await this.loader.loadAsync(fieldUrl);
            const model = fieldGLTF.scene;
            let fieldMesh = null;
            model.traverse(c => {
                if(c.isMesh) {
                    c.receiveShadow = true;
                    c.material.roughness = 1.0;
                    c.material.metalness = 0.0;
                    fieldMesh = c;
                }
            });
            this.gameFieldMesh = fieldMesh;
            this.scene.add(model);
        } catch (error) {
            // ... fallback logic
        }

        // Generate Constant Matte Yellow Spheres
        for (let i = 0; i < pieceConfig.count; i++) {
            const geometry = new THREE.SphereGeometry(pieceConfig.radius, 32, 32);
            geometry.translate(0, pieceConfig.radius, 0);

            const material = new THREE.MeshStandardMaterial({
                color: 0xffff00,
                roughness: 1.0,
                metalness: 0.0
            });

            const sphere = new THREE.Mesh(geometry, material);
            sphere.castShadow = true;
            this.pieces.push(sphere);
        }
    }

    /**
     * Returns the bounding box of the field mesh
     */
    getFieldBounds() {
        if (!this.gameFieldMesh) return null;
        return new THREE.Box3().setFromObject(this.gameFieldMesh);
    }

    /**
     * Scatter spheres only within the field bounds
     */
    scatterWithinBounds(count, bounds) {
        // (Unused in new logic, but kept for compatibility)
        this.spawnedInstances.forEach(p => this.scene.remove(p));
        this.spawnedInstances = [];
    }

    /**
     * Get the effective radius of a ball (accounting for scale)
     */
    getBallRadius(ball) {
        const baseRadius = ball.geometry.parameters.radius;
        return baseRadius * ball.scale.x;
    }

    /**
     * Check if a position would cause collision with existing balls
     */
    wouldCollide(x, z, radius, existingBalls) {
        for (const ball of existingBalls) {
            const otherRadius = this.getBallRadius(ball);
            const dx = x - ball.position.x;
            const dz = z - ball.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const minDistance = radius + otherRadius;
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }

    /**
     * Spawn spheres randomly on a given y plane, preventing ball-to-ball clipping
     */
    spawnOnPlane(count, minX, maxX, minZ, maxZ, y) {
        this.spawnedInstances.forEach(p => this.scene.remove(p));
        this.spawnedInstances = [];

        const maxAttempts = 100; // Max attempts per ball to find non-colliding position

        for (let i = 0; i < count; i++) {
            const template = this.pieces[Math.floor(Math.random() * this.pieces.length)];
            const clone = template.clone();
            clone.scale.set(2.0, 2.0, 2.0);

            const effectiveRadius = this.getBallRadius(clone);
            let placed = false;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
                const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());

                if (!this.wouldCollide(x, z, effectiveRadius, this.spawnedInstances)) {
                    clone.position.set(x, y, z);
                    placed = true;
                    break;
                }
            }

            // If we couldn't find a non-colliding position after max attempts,
            // skip this ball to avoid infinite loops with too many balls
            if (!placed) {
                clone.geometry.dispose();
                clone.material.dispose();
                continue;
            }

            this.scene.add(clone);
            this.spawnedInstances.push(clone);
        }
    }

    /**
     * Snap object to field floor using raycast
     */
    snapToFloor(object, bounds) {
        if (!this.gameFieldMesh) return;
        this.raycaster.set(object.position, this.downVector);
        const intersects = this.raycaster.intersectObject(this.gameFieldMesh, true);
        if (intersects.length > 0) {
            object.position.y = intersects[0].point.y + object.geometry.parameters.radius * object.scale.y;
        } else if (bounds) {
            object.position.y = bounds.min.y + object.geometry.parameters.radius * object.scale.y;
        } else {
            object.position.y = 0;
        }
    }

    /**
     * Check if object is clipping into the field mesh
     */
    isClipping(object) {
        if (!this.gameFieldMesh) return false;
        // Use bounding box intersection
        const objBox = new THREE.Box3().setFromObject(object);
        const fieldBox = new THREE.Box3().setFromObject(this.gameFieldMesh);
        return !fieldBox.containsBox(objBox);
    }

    snapToFloor(object) {
        if (!this.gameFieldMesh) return;

        this.raycaster.set(object.position, this.downVector);
        const intersects = this.raycaster.intersectObject(this.gameFieldMesh, true);

        if (intersects.length > 0) {
            object.position.y = intersects[0].point.y;
        } else {
            object.position.y = 0; 
        }
    }
}