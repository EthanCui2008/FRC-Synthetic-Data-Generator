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
     * Spawn spheres randomly on a given y plane, allowing clipping
     */
    spawnOnPlane(count, minX, maxX, minZ, maxZ, y) {
        this.spawnedInstances.forEach(p => this.scene.remove(p));
        this.spawnedInstances = [];
        for (let i = 0; i < count; i++) {
            const template = this.pieces[Math.floor(Math.random() * this.pieces.length)];
            const clone = template.clone();
            const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
            const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
            // All balls same size
            clone.scale.set(2.0, 2.0, 2.0);
            clone.position.set(x, y, z);
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