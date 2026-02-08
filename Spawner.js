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
     * Loads the field GLTF and piece GLTF models
     * @param {string} fieldUrl - Path to the game field GLTF
     * @param {string} pieceUrl - Path to the piece GLTF
     */
    async loadAssets(fieldUrl, pieceUrl) {
        // Load the field
        try {
            const fieldGLTF = await this.loader.loadAsync(fieldUrl);
            const model = fieldGLTF.scene;
            let fieldMesh = null;

            model.traverse(c => {
                if(c.isMesh) {
                    // Enable shadows
                    c.receiveShadow = true;
                    c.castShadow = true;

                    // Preserve GLTF material properties if they exist
                    if (c.material) {
                        // If material already has PBR properties, keep them
                        // Otherwise set default matte values
                        if (c.material.roughness === undefined) {
                            c.material.roughness = 1.0;
                        }
                        if (c.material.metalness === undefined) {
                            c.material.metalness = 0.0;
                        }

                        // Ensure material responds to lights properly
                        c.material.needsUpdate = true;
                    }

                    fieldMesh = c;
                }
            });

            this.gameFieldMesh = fieldMesh;
            this.scene.add(model);
        } catch (error) {
            console.warn('Failed to load field GLTF:', error);
            // Fallback: create a simple plane if GLTF fails
            const planeGeometry = new THREE.PlaneGeometry(20, 20);
            const planeMaterial = new THREE.MeshStandardMaterial({
                color: 0x808080,
                roughness: 1.0,
                metalness: 0.0
            });
            const plane = new THREE.Mesh(planeGeometry, planeMaterial);
            plane.rotation.x = -Math.PI / 2;
            plane.receiveShadow = true;
            this.gameFieldMesh = plane;
            this.scene.add(plane);
        }

        // Load the piece GLB
        try {
            const pieceGLTF = await this.loader.loadAsync(pieceUrl);
            const pieceModel = pieceGLTF.scene;

            // Enable shadows and preserve materials for all meshes in the piece
            pieceModel.traverse(c => {
                if(c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;

                    // Preserve GLTF material properties if they exist
                    if (c.material) {
                        if (c.material.roughness === undefined) {
                            c.material.roughness = 1.0;
                        }
                        if (c.material.metalness === undefined) {
                            c.material.metalness = 0.0;
                        }
                        c.material.needsUpdate = true;
                    }
                }
            });

            // Calculate bounding box to determine size
            const bbox = new THREE.Box3().setFromObject(pieceModel);
            const size = new THREE.Vector3();
            bbox.getSize(size);

            // Store the base radius as the maximum dimension / 2 (for collision detection)
            this.pieceBaseRadius = Math.max(size.x, size.z) / 2;

            // Store the template
            this.pieces.push(pieceModel);

            console.log('Piece GLB loaded successfully. Base radius:', this.pieceBaseRadius);
        } catch (error) {
            console.error('Failed to load piece GLTF:', error);
            console.warn('Creating fallback sphere');

            // Fallback to sphere if piece GLB fails to load
            const geometry = new THREE.SphereGeometry(0.05, 32, 32);
            geometry.translate(0, 0.05, 0);
            const material = new THREE.MeshStandardMaterial({
                color: 0xffff00,
                roughness: 1.0,
                metalness: 0.0
            });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.castShadow = true;
            this.pieces.push(sphere);
            this.pieceBaseRadius = 0.05;
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
     * Get the effective radius of an object (accounting for scale)
     * Works with both sphere geometry and GLB models
     */
    getObjectRadius(object) {
        // For GLB models, use the stored base radius
        if (this.pieceBaseRadius !== undefined) {
            return this.pieceBaseRadius * object.scale.x;
        }

        // Fallback: calculate from bounding box
        const bbox = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        bbox.getSize(size);
        return Math.max(size.x, size.z) / 2;
    }

    /**
     * Check if a position would cause collision with existing objects
     */
    wouldCollide(x, z, radius, existingObjects) {
        for (const obj of existingObjects) {
            const otherRadius = this.getObjectRadius(obj);
            const dx = x - obj.position.x;
            const dz = z - obj.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const minDistance = radius + otherRadius;
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }

    /**
     * Spawn GLB models randomly on a given y plane, preventing object-to-object clipping
     */
    spawnOnPlane(count, minX, maxX, minZ, maxZ, y, objectSize = 0.05) {
        this.spawnedInstances.forEach(p => this.scene.remove(p));
        this.spawnedInstances = [];

        const maxAttempts = 100; // Max attempts per object to find non-colliding position

        for (let i = 0; i < count; i++) {
            const template = this.pieces[Math.floor(Math.random() * this.pieces.length)];
            const clone = template.clone(true); // Deep clone to include all children

            // Calculate scale based on desired objectSize and base radius
            const scale = objectSize / this.pieceBaseRadius;
            clone.scale.set(scale, scale, scale);

            const effectiveRadius = this.getObjectRadius(clone);
            let placed = false;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
                const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());

                if (!this.wouldCollide(x, z, effectiveRadius, this.spawnedInstances)) {
                    clone.position.set(x, y, z);

                    // Random rotation around Y axis for variety
                    clone.rotation.y = Math.random() * Math.PI * 2;

                    placed = true;
                    break;
                }
            }

            // If we couldn't find a non-colliding position after max attempts,
            // skip this object to avoid infinite loops with too many objects
            if (!placed) {
                // Clean up the clone
                clone.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) {
                        if (Array.isArray(c.material)) {
                            c.material.forEach(m => m.dispose());
                        } else {
                            c.material.dispose();
                        }
                    }
                });
                continue;
            }

            this.scene.add(clone);
            this.spawnedInstances.push(clone);
        }
    }

    /**
     * Snap object to field floor using raycast (works with GLB models)
     */
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
}