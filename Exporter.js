import * as THREE from 'three';

export class Exporter {
    constructor(camera, renderer, scene) {
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;
    }

    // Convert 3D world pos to 2D screen coordinates (0 to 1 range)
    toScreenPosition(obj) {
        const vector = new THREE.Vector3();
        
        // Get center or specific vertices. 
        // Better: Compute AABB (Axis Aligned Bounding Box)
        const box = new THREE.Box3().setFromObject(obj);
        
        // Get the 8 corners of the 3D box
        const corners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ];

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        corners.forEach(corner => {
            corner.project(this.camera); // Project to NDC (-1 to +1)
            
            // Convert to 0->1 space
            const x = (corner.x * 0.5) + 0.5;
            const y = -(corner.y * 0.5) + 0.5; // Flip Y for image coords

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        });

        // Check if object is actually in view (simple check)
        if (maxX < 0 || minX > 1 || maxY < 0 || minY > 1) return null;

        return {
            label: "game_piece",
            bbox: [minX, minY, maxX, maxY] // x_min, y_min, x_max, y_max
        };
    }

    generateDataset(spawnedObjects, index) {
        // 1. Get Bounding Boxes
        const labels = spawnedObjects
            .map(obj => this.toScreenPosition(obj))
            .filter(res => res !== null);

        // 2. Get Image Data (Base64)
        const imgData = this.renderer.domElement.toDataURL("image/png");

        // 3. Trigger Download (In a real pipeline, send to server)
        this.downloadJSON(labels, `data_${index}.json`);
        this.downloadImage(imgData, `image_${index}.png`);
    }

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
    }

    downloadImage(dataUrl, filename) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.click();
    }
}