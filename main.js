import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { Spawner } from './Spawner.js';
import { Exporter } from './Exporter.js';
import { NoiseShader } from './NoiseShader.js';

// --- 1. Scene & Camera Setup ---
let fieldBounds = null;
const scene = new THREE.Scene();
// Background will be set to equirectangular skybox in init()


// Camera: 55° vertical FOV, 1920x1200 aspect (80° horizontal)
const CAMERA_FOV = 55;
const CAMERA_WIDTH = 1920;
const CAMERA_HEIGHT = 1200;
const CAMERA_ASPECT = CAMERA_WIDTH / CAMERA_HEIGHT;
let CAMERA_HEIGHT_ABOVE_GROUND = 0.7; // Adjustable height above ground (meters)
const camera = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_ASPECT, 0.1, 1000);
camera.position.set(0, 30, 30);


const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true
});
renderer.setSize(CAMERA_WIDTH, CAMERA_HEIGHT);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // Sharp shadows, computationally cheaper

// Color space and tone mapping for proper emissive rendering
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const canvasWrapper = document.getElementById('canvas-wrapper');
canvasWrapper.appendChild(renderer.domElement);

// --- 2. Lighting (4 directional lights in a square pattern) ---
// Hemisphere light for natural ambient lighting
const hemisphereLight = new THREE.HemisphereLight(
    0xffffff, // Sky color (top)
    0x444444, // Ground color (bottom)
    0.5       // Intensity
);
scene.add(hemisphereLight);

// 4 directional lights placed 20 units above, in a square 10 units apart
// Light positions: (-5, 20, -5), (5, 20, -5), (-5, 20, 5), (5, 20, 5)
const LIGHT_HEIGHT = 20;
const LIGHT_SPREAD = 5; // Half of 10 units apart
const LIGHT_INTENSITY = 0.8; // Reduced intensity divided among 4 lights

const overheadLights = [];

function createDirectionalLight(x, z) {
    const light = new THREE.DirectionalLight(0xffffff, LIGHT_INTENSITY);
    light.position.set(x, LIGHT_HEIGHT, z);
    light.castShadow = true;

    // Shadow configuration for sharp, high-quality shadows (4x resolution: 2048 -> 8192)
    light.shadow.mapSize.width = 8192;
    light.shadow.mapSize.height = 8192;
    light.shadow.camera.left = -15;
    light.shadow.camera.right = 15;
    light.shadow.camera.top = 15;
    light.shadow.camera.bottom = -15;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 50;
    light.shadow.bias = -0.0001;

    // Point straight down (target directly below light position)
    light.target.position.set(x, 0, z);

    scene.add(light);
    scene.add(light.target);

    return light;
}

// Create 4 lights in square pattern
overheadLights.push(createDirectionalLight(-LIGHT_SPREAD, -LIGHT_SPREAD)); // Front-left
overheadLights.push(createDirectionalLight(LIGHT_SPREAD, -LIGHT_SPREAD));  // Front-right
overheadLights.push(createDirectionalLight(-LIGHT_SPREAD, LIGHT_SPREAD));  // Back-left
overheadLights.push(createDirectionalLight(LIGHT_SPREAD, LIGHT_SPREAD));   // Back-right

// --- 3. Post-Processing (The Noise Filter) ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const noisePass = new ShaderPass(NoiseShader);
noisePass.uniforms["noiseAmount"].value = 0.15;
noisePass.uniforms["grayscale"].value = 1.0;
composer.addPass(noisePass);

// --- 4. Helpers ---
const spawner = new Spawner(scene);
const exporter = new Exporter(camera, renderer, scene);

// --- 5. UI Logic ---

const grayscaleToggle = document.getElementById('toggle-grayscale');
const noiseSlider = document.getElementById('noise-amount');
const noiseValue = document.getElementById('noise-amount-value');
const regenBtn = document.getElementById('regen-btn');

const cameraHeightSlider = document.getElementById('camera-height');
const cameraHeightValue = document.getElementById('camera-height-value');
const cameraMinXInput = document.getElementById('camera-min-x');
const cameraMaxXInput = document.getElementById('camera-max-x');
const cameraMinZInput = document.getElementById('camera-min-z');
const cameraMaxZInput = document.getElementById('camera-max-z');
const spawnCountSlider = document.getElementById('spawn-count');
const spawnCountValue = document.getElementById('spawn-count-value');
const ballSizeSlider = document.getElementById('ball-size');
const ballSizeValue = document.getElementById('ball-size-value');
const pieceHeightSlider = document.getElementById('piece-height');
const pieceHeightValue = document.getElementById('piece-height-value');
const cameraXInfo = document.getElementById('camera-x');
const cameraYInfo = document.getElementById('camera-y');
const cameraZInfo = document.getElementById('camera-z');
const cameraPitchInfo = document.getElementById('camera-pitch-info');
const cameraYawInfo = document.getElementById('camera-yaw-info');
const cameraVFovSlider = document.getElementById('camera-vfov');
const cameraVFovValue = document.getElementById('camera-vfov-value');
const cameraHFovSlider = document.getElementById('camera-hfov');
const cameraHFovValue = document.getElementById('camera-hfov-value');
const batchCountInput = document.getElementById('batch-count');
const downloadBatchBtn = document.getElementById('download-batch-btn');
const batchProgress = document.getElementById('batch-progress');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

// Camera bounds and angle state
let cameraMinX = -9, cameraMaxX = 9, cameraMinZ = -4, cameraMaxZ = 4;
let spawnCount = 12;
let ballSize = 0.05;
let pieceHeight = 0; // Height trim for raising pieces

// --- Camera UI Logic ---

cameraHeightSlider.addEventListener('input', (e) => {
    CAMERA_HEIGHT_ABOVE_GROUND = parseFloat(e.target.value);
    cameraHeightValue.textContent = parseFloat(e.target.value).toFixed(2) + ' m';
    randomizeScene();
});

cameraMinXInput.addEventListener('change', (e) => {
    cameraMinX = parseFloat(e.target.value);
    randomizeScene();
});
cameraMaxXInput.addEventListener('change', (e) => {
    cameraMaxX = parseFloat(e.target.value);
    randomizeScene();
});
cameraMinZInput.addEventListener('change', (e) => {
    cameraMinZ = parseFloat(e.target.value);
    randomizeScene();
});
cameraMaxZInput.addEventListener('change', (e) => {
    cameraMaxZ = parseFloat(e.target.value);
    randomizeScene();
});
spawnCountSlider.addEventListener('input', (e) => {
    spawnCount = parseInt(e.target.value);
    spawnCountValue.textContent = e.target.value;
    randomizeScene();
});

cameraVFovSlider.addEventListener('input', (e) => {
    camera.fov = parseFloat(e.target.value);
    cameraVFovValue.textContent = e.target.value;
    camera.updateProjectionMatrix();
    randomizeScene();
});

cameraHFovSlider.addEventListener('input', (e) => {
    const hfov = parseFloat(e.target.value);
    cameraHFovValue.textContent = hfov;
    const vfov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / CAMERA_ASPECT) * 180 / Math.PI;
    camera.fov = vfov;
    cameraVFovValue.textContent = vfov.toFixed(1);
    cameraVFovSlider.value = vfov.toFixed(1);
    camera.updateProjectionMatrix();
    randomizeScene();
});

// Resolution preset buttons
document.getElementById('res-1920x1200').addEventListener('click', () => setResolution(1920, 1200));
document.getElementById('res-1280x720').addEventListener('click', () => setResolution(1280, 720));
document.getElementById('res-640x480').addEventListener('click', () => setResolution(640, 480));

downloadBatchBtn.addEventListener('click', downloadBatch);

grayscaleToggle.addEventListener('change', (e) => {
    noisePass.uniforms["grayscale"].value = e.target.checked ? 1.0 : 0.0;
});

noiseSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    noisePass.uniforms["noiseAmount"].value = value;
    noiseValue.textContent = value.toFixed(2);
});

ballSizeSlider.addEventListener('input', (e) => {
    ballSize = parseFloat(e.target.value);
    ballSizeValue.textContent = ballSize.toFixed(3);
    randomizeScene();
});

pieceHeightSlider.addEventListener('input', (e) => {
    pieceHeight = parseFloat(e.target.value);
    pieceHeightValue.textContent = pieceHeight.toFixed(2);
    randomizeScene();
});

regenBtn.addEventListener('click', () => {
    randomizeScene();
});

function setResolution(width, height) {
    renderer.setSize(width, height);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    randomizeScene();
}

async function downloadBatch() {
    const count = parseInt(batchCountInput.value);
    if (count < 1 || count > 1000) {
        alert('Please enter a count between 1 and 1000');
        return;
    }

    downloadBatchBtn.disabled = true;
    progressContainer.classList.add('active');
    progressBar.style.width = '0%';
    batchProgress.textContent = 'Generating YOLO dataset...';

    const generateFrame = async () => {
        randomizeScene();
        await new Promise(r => setTimeout(r, 50));
        composer.render();

        const imageData = renderer.domElement.toDataURL('image/png').split(',')[1];
        const labels = exporter.generateLabels(spawner.spawnedInstances);

        return { imageData, labels };
    };

    const onProgress = (current, total) => {
        const percent = (current / total) * 100;
        progressBar.style.width = `${percent}%`;
        batchProgress.textContent = `Generating: ${current}/${total} (${percent.toFixed(0)}%)`;
    };

    const zip = await exporter.generateYOLODataset(generateFrame, count, onProgress);

    batchProgress.textContent = 'Creating ZIP file...';
    progressBar.style.width = '100%';

    zip.generateAsync({ type: 'blob' }).then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `yolo_dataset_${new Date().getTime()}.zip`;
        a.click();
        URL.revokeObjectURL(url);

        downloadBatchBtn.disabled = false;
        batchProgress.textContent = `Complete! ${count} images generated.`;

        setTimeout(() => {
            batchProgress.textContent = '';
            progressContainer.classList.remove('active');
            progressBar.style.width = '0%';
        }, 5000);
    });
}

// --- 6. Core Functions ---

function randomizeScene() {
    if (!fieldBounds) return;

    // --- Spawn N pieces randomly on plane with dynamic size and height trim ---
    spawner.spawnOnPlane(spawnCount, cameraMinX, cameraMaxX, cameraMinZ, cameraMaxZ, pieceHeight, ballSize);

    // --- Camera: random position, yaw and pitch controlled by sliders ---
    const minX = (cameraMinX !== null) ? cameraMinX : -10;
    const maxX = (cameraMaxX !== null) ? cameraMaxX : 10;
    const minZ = (cameraMinZ !== null) ? cameraMinZ : -5;
    const maxZ = (cameraMaxZ !== null) ? cameraMaxZ : 5;

    const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
    const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
    const y = CAMERA_HEIGHT_ABOVE_GROUND;
    camera.position.set(x, y, z);

    // Calculate direction toward field center
    const fieldCenterX = (minX + maxX) / 2;
    const fieldCenterZ = (minZ + maxZ) / 2;
    const dx = fieldCenterX - x;
    const dz = fieldCenterZ - z;
    const dy = 0 - y; // Field is at y=0
    
    // Calculate yaw (horizontal angle toward field center)
    let yaw = Math.atan2(dz, dx) * 180 / Math.PI;
    // Add random variation ±30° around the inward direction
    yaw += THREE.MathUtils.randFloat(-30, 30);
    
    // Calculate pitch (vertical angle toward field center)
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    let basePitch = Math.atan2(dy, distXZ) * 180 / Math.PI;
    // Clamp pitch between 0 and -15 (downward only)
    let pitch = Math.max(-15, Math.min(0, basePitch));
    // Add small random variation
    pitch += THREE.MathUtils.randFloat(-5, 0);
    pitch = Math.max(-15, Math.min(0, pitch));

    // Set camera rotation
    const yawRad = yaw * Math.PI / 180.0;
    const pitchRad = pitch * Math.PI / 180.0;
    const lookDir = new THREE.Vector3(
        Math.cos(pitchRad) * Math.cos(yawRad),
        Math.sin(pitchRad),
        Math.cos(pitchRad) * Math.sin(yawRad)
    );
    camera.lookAt(camera.position.clone().add(lookDir));
    camera.updateMatrixWorld();

    // Display camera info
    cameraXInfo.textContent = x.toFixed(2);
    cameraYInfo.textContent = y.toFixed(2);
    cameraZInfo.textContent = z.toFixed(2);
    cameraPitchInfo.textContent = pitch.toFixed(1);
    cameraYawInfo.textContent = yaw.toFixed(1);
}

async function init() {
    // Load HDR environment map for lighting
    const rgbeLoader = new RGBELoader();
    try {
        const hdrTexture = await rgbeLoader.loadAsync('assets/field.hdr');
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = hdrTexture;
        console.log('HDR environment loaded successfully');
    } catch (error) {
        console.warn('Failed to load HDR environment:', error);
    }

    // Load background.jpg as equirectangular skybox
    const textureLoader = new THREE.TextureLoader();
    try {
        const backgroundTexture = await textureLoader.loadAsync('assets/background.jpg');
        backgroundTexture.mapping = THREE.EquirectangularReflectionMapping;
        backgroundTexture.colorSpace = THREE.SRGBColorSpace;
        scene.background = backgroundTexture;
        console.log('Background skybox loaded successfully');
    } catch (error) {
        console.warn('Failed to load background skybox:', error);
        scene.background = new THREE.Color(0xffffff); // Fallback to white
    }

    // Load field and piece GLB models
    await spawner.loadAssets('assets/field.glb', 'assets/piece.glb');

    // Get field bounds from spawner
    fieldBounds = spawner.getFieldBounds();
    randomizeScene();
}

// Standard Render Loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update shader time for animated noise effect
    noisePass.uniforms["time"].value += 0.01;
    
    composer.render();
}

// Launch
init();
animate();

// --- 7. Synthetic Data Export ---
// Optional: You can trigger this from a UI button or a loop
window.runExport = async function(count = 5) {
    for (let i = 0; i < count; i++) {
        randomizeScene();
        // Allow a moment for the scene to update
        await new Promise(r => setTimeout(r, 100));
        composer.render();
        exporter.generateDataset(spawner.spawnedInstances, i);
    }
};