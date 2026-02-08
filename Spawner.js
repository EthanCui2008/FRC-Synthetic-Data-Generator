import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Spawner {
    constructor(scene) {
        this.scene = scene;
        this.loader = new GLTFLoader();

        this.fieldModel = null;
        this.fieldMeshes = [];
        this.obstacleMeshes = [];
        this.floorMesh = null;
        this.pieces = [];
        this.spawnedInstances = [];
        this.pieceBaseRadius = 0.1;
        this.pieceHeight = 0.1;
    }

    async loadAssets(fieldUrl, pieceUrl) {
        // Load the field
        try {
            const fieldGLTF = await this.loader.loadAsync(fieldUrl);
            this.fieldModel = fieldGLTF.scene;

            this.fieldModel.traverse(c => {
                if (c.isMesh) {
                    c.receiveShadow = true;
                    c.castShadow = true;

                    if (c.material) {
                        if (c.material.roughness === undefined) c.material.roughness = 1.0;
                        if (c.material.metalness === undefined) c.material.metalness = 0.0;
                        c.material.needsUpdate = true;
                    }

                    this.fieldMeshes.push(c);

                    const name = (c.name || '').toLowerCase();
                    if (name.includes('carpet') || name.includes('floor') || name.includes('ground')) {
                        this.floorMesh = c;
                    } else {
                        this.obstacleMeshes.push(c);
                    }
                }
            });

            // If no floor identified by name, use largest horizontal mesh
            if (!this.floorMesh && this.fieldMeshes.length > 0) {
                let largestArea = 0;
                for (const mesh of this.fieldMeshes) {
                    const bbox = new THREE.Box3().setFromObject(mesh);
                    const size = new THREE.Vector3();
                    bbox.getSize(size);
                    const area = size.x * size.z;
                    if (area > largestArea) {
                        largestArea = area;
                        this.floorMesh = mesh;
                    }
                }
                this.obstacleMeshes = this.obstacleMeshes.filter(m => m !== this.floorMesh);
            }

            this.scene.add(this.fieldModel);
            console.log(`Field loaded: ${this.fieldMeshes.length} meshes, ${this.obstacleMeshes.length} obstacles`);
        } catch (error) {
            console.warn('Failed to load field GLTF:', error);
            const plane = new THREE.Mesh(
                new THREE.PlaneGeometry(20, 20),
                new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 1.0, metalness: 0.0 })
            );
            plane.rotation.x = -Math.PI / 2;
            plane.receiveShadow = true;
            this.floorMesh = plane;
            this.fieldMeshes.push(plane);
            this.scene.add(plane);
        }

        // Load the piece GLB
        try {
            const pieceGLTF = await this.loader.loadAsync(pieceUrl);
            const pieceModel = pieceGLTF.scene;

            pieceModel.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                    if (c.material) {
                        if (c.material.roughness === undefined) c.material.roughness = 1.0;
                        if (c.material.metalness === undefined) c.material.metalness = 0.0;
                        c.material.needsUpdate = true;
                    }
                }
            });

            const bbox = new THREE.Box3().setFromObject(pieceModel);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            this.pieceBaseRadius = Math.max(size.x, size.z) / 2;
            this.pieceHeight = size.y;
            this.pieces.push(pieceModel);

            console.log('Piece loaded. Radius:', this.pieceBaseRadius, 'Height:', this.pieceHeight);
        } catch (error) {
            console.error('Failed to load piece GLTF:', error);
            // Fallback sphere
            const geometry = new THREE.SphereGeometry(0.05, 32, 32);
            geometry.translate(0, 0.05, 0);
            const material = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 1.0, metalness: 0.0 });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.castShadow = true;
            this.pieces.push(sphere);
            this.pieceBaseRadius = 0.05;
            this.pieceHeight = 0.1;
        }
    }

    getFieldBounds() {
        if (!this.floorMesh) return null;
        return new THREE.Box3().setFromObject(this.floorMesh);
    }

    getObjectRadius(object) {
        return this.pieceBaseRadius * object.scale.x;
    }

    wouldCollideWithPieces(x, z, radius, existingObjects) {
        for (const obj of existingObjects) {
            const otherRadius = this.getObjectRadius(obj);
            const dx = x - obj.position.x;
            const dz = z - obj.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            if (distance < radius + otherRadius) {
                return true;
            }
        }
        return false;
    }

    wouldClipIntoObstacle(x, y, z, radius) {
        const pieceSphere = new THREE.Sphere(
            new THREE.Vector3(x, y + this.pieceHeight / 2, z),
            radius
        );

        for (const obstacle of this.obstacleMeshes) {
            const obstacleBox = new THREE.Box3().setFromObject(obstacle);
            if (obstacleBox.intersectsSphere(pieceSphere)) {
                return true;
            }
        }
        return false;
    }

    spawnOnPlane(count, minX, maxX, minZ, maxZ, heightTrim = 0) {
        // Clear existing
        this.spawnedInstances.forEach(p => this.scene.remove(p));
        this.spawnedInstances = [];

        if (this.pieces.length === 0) {
            console.warn('No pieces loaded, cannot spawn');
            return;
        }

        const maxAttempts = 150;
        const floorY = heightTrim;

        for (let i = 0; i < count; i++) {
            const template = this.pieces[Math.floor(Math.random() * this.pieces.length)];
            const clone = template.clone(true);
            clone.scale.set(1, 1, 1);

            const effectiveRadius = this.getObjectRadius(clone);
            let placed = false;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
                const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());

                if (this.wouldCollideWithPieces(x, z, effectiveRadius, this.spawnedInstances)) {
                    continue;
                }

                if (this.wouldClipIntoObstacle(x, floorY, z, effectiveRadius)) {
                    continue;
                }

                clone.position.set(x, floorY, z);
                clone.rotation.y = Math.random() * Math.PI * 2;
                placed = true;
                break;
            }

            if (!placed) {
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

        console.log(`Spawned ${this.spawnedInstances.length}/${count} pieces`);
    }
}
