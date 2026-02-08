import * as THREE from 'three';

import {
    scene,
    camera,
    renderer,
    controls,
    composer,
    noisePass,
    loadEnvironment
} from './rendering.js';

import { Spawner } from './Spawner.js';
import { Exporter } from './Exporter.js';

// --- Helpers ---
const spawner = new Spawner(scene);
const exporter = new Exporter(camera, renderer, scene);

// --- UI Elements ---
const grayscaleToggle = document.getElementById('toggle-grayscale');
const noiseSlider = document.getElementById('noise-amount');
const noiseValue = document.getElementById('noise-amount-value');
const envBrightnessSlider = document.getElementById('env-brightness');
const envBrightnessValue = document.getElementById('env-brightness-value');
const envFalloffSlider = document.getElementById('env-falloff');
const envFalloffValue = document.getElementById('env-falloff-value');
const regenBtn = document.getElementById('regen-btn');
const cameraHeightSlider = document.getElementById('camera-height');
const cameraHeightValue = document.getElementById('camera-height-value');
const pieceHeightSlider = document.getElementById('piece-height');
const pieceHeightValue = document.getElementById('piece-height-value');
const cameraXInfo = document.getElementById('camera-x');
const cameraYInfo = document.getElementById('camera-y');
const cameraZInfo = document.getElementById('camera-z');
const cameraPitchInfo = document.getElementById('camera-pitch-info');
const cameraYawInfo = document.getElementById('camera-yaw-info');
const batchCountInput = document.getElementById('batch-count');
const downloadBatchBtn = document.getElementById('download-batch-btn');
const batchProgress = document.getElementById('batch-progress');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');

// --- State ---
let fieldBounds = null;
const SPAWN_BOUNDS = { minX: -9, maxX: 9, minZ: -4, maxZ: 4 };
const SPAWN_COUNT = 300;
let CAMERA_HEIGHT_ABOVE_GROUND = 0.3;
let pieceHeightTrim = 0.075;
let isEditingCameraState = false;

// --- Event Listeners ---
cameraHeightSlider.addEventListener('input', (e) => {
    CAMERA_HEIGHT_ABOVE_GROUND = parseFloat(e.target.value);
    cameraHeightValue.textContent = parseFloat(e.target.value).toFixed(2) + ' m';
});

pieceHeightSlider.addEventListener('input', (e) => {
    pieceHeightTrim = parseFloat(e.target.value);
    pieceHeightValue.textContent = pieceHeightTrim.toFixed(3);
    respawnPieces();
});

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

function updateEnvironmentFromUI() {
    const brightness = parseFloat(envBrightnessSlider.value);
    const falloffPower = parseFloat(envFalloffSlider.value);
    envBrightnessValue.textContent = brightness.toFixed(1);
    envFalloffValue.textContent = falloffPower.toFixed(1);
    loadEnvironment({ brightness, falloffPower });
}

envBrightnessSlider.addEventListener('input', updateEnvironmentFromUI);
envFalloffSlider.addEventListener('input', updateEnvironmentFromUI);

regenBtn.addEventListener('click', () => randomizeScene());

// Camera state manual input handlers
const cameraStateInputs = [cameraXInfo, cameraYInfo, cameraZInfo, cameraPitchInfo, cameraYawInfo];

cameraStateInputs.forEach(input => {
    input.addEventListener('focus', () => {
        isEditingCameraState = true;
    });
    input.addEventListener('blur', () => {
        isEditingCameraState = false;
    });
    input.addEventListener('change', applyCameraFromInputs);
});

// --- Functions ---
function applyCameraFromInputs() {
    const x = parseFloat(cameraXInfo.value) || 0;
    const y = parseFloat(cameraYInfo.value) || 0;
    const z = parseFloat(cameraZInfo.value) || 0;
    const pitch = parseFloat(cameraPitchInfo.value) || 0;
    const yaw = parseFloat(cameraYawInfo.value) || 0;

    camera.position.set(x, y, z);

    const pitchRad = pitch * Math.PI / 180;
    const yawRad = yaw * Math.PI / 180;
    const lookDir = new THREE.Vector3(
        Math.cos(pitchRad) * Math.cos(yawRad),
        Math.sin(pitchRad),
        Math.cos(pitchRad) * Math.sin(yawRad)
    );

    camera.lookAt(camera.position.clone().add(lookDir));
    camera.updateMatrixWorld();

    const target = camera.position.clone().add(lookDir.multiplyScalar(5));
    controls.target.copy(target);
    controls.update();
}

function setResolution(width, height) {
    renderer.setSize(width, height);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}

function respawnPieces() {
    if (!fieldBounds) return;
    const { minX, maxX, minZ, maxZ } = SPAWN_BOUNDS;
    spawner.spawnOnPlane(SPAWN_COUNT, minX, maxX, minZ, maxZ, pieceHeightTrim);
}

function updateCameraInfo() {
    if (isEditingCameraState) return;

    cameraXInfo.value = camera.position.x.toFixed(2);
    cameraYInfo.value = camera.position.y.toFixed(2);
    cameraZInfo.value = camera.position.z.toFixed(2);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const pitch = Math.asin(direction.y) * 180 / Math.PI;
    const yaw = Math.atan2(direction.z, direction.x) * 180 / Math.PI;
    cameraPitchInfo.value = pitch.toFixed(1);
    cameraYawInfo.value = yaw.toFixed(1);
}

async function downloadBatch() {
    const count = parseInt(batchCountInput.value);
    if (count < 1 || count > 10000) {
        alert('Please enter a count between 1 and 10000');
        return;
    }

    controls.enabled = false;
    downloadBatchBtn.disabled = true;
    regenBtn.disabled = true;
    progressContainer.classList.add('active');
    progressBar.style.width = '0%';
    batchProgress.textContent = 'Generating YOLO dataset...';

    const zip = new JSZip();
    const imagesFolder = zip.folder('images');
    const labelsFolder = zip.folder('labels');

    for (let i = 0; i < count; i++) {
        randomizeScene();
        await new Promise(r => setTimeout(r, 30));
        composer.render();

        const imageData = renderer.domElement.toDataURL('image/png').split(',')[1];
        const labels = exporter.generateLabels(spawner.spawnedInstances);

        const filename = String(i).padStart(6, '0');
        imagesFolder.file(`${filename}.png`, imageData, { base64: true });
        labelsFolder.file(`${filename}.txt`, labels);

        const percent = ((i + 1) / count) * 100;
        progressBar.style.width = `${percent}%`;
        batchProgress.textContent = `Generating: ${i + 1}/${count} (${percent.toFixed(0)}%)`;

        if (i % 5 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    batchProgress.textContent = 'Compressing ZIP...';

    const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (metadata) => {
            batchProgress.textContent = `Compressing: ${metadata.percent.toFixed(0)}%`;
        }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yolo_dataset_${new Date().getTime()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    controls.enabled = true;
    downloadBatchBtn.disabled = false;
    regenBtn.disabled = false;
    batchProgress.textContent = `Complete! ${count} images generated.`;

    setTimeout(() => {
        batchProgress.textContent = '';
        progressContainer.classList.remove('active');
        progressBar.style.width = '0%';
    }, 5000);
}

function randomizeScene() {
    if (!fieldBounds) return;

    const { minX, maxX, minZ, maxZ } = SPAWN_BOUNDS;

    spawner.spawnOnPlane(SPAWN_COUNT, minX, maxX, minZ, maxZ, pieceHeightTrim);

    const x = THREE.MathUtils.lerp(minX, maxX, Math.random());
    const z = THREE.MathUtils.lerp(minZ, maxZ, Math.random());
    const y = CAMERA_HEIGHT_ABOVE_GROUND;
    camera.position.set(x, y, z);

    const fieldCenterX = (minX + maxX) / 2;
    const fieldCenterZ = (minZ + maxZ) / 2;
    const dx = fieldCenterX - x;
    const dz = fieldCenterZ - z;
    const dy = -y;

    let yaw = Math.atan2(dz, dx) * 180 / Math.PI;
    yaw += THREE.MathUtils.randFloat(-30, 30);

    const distXZ = Math.sqrt(dx * dx + dz * dz);
    let basePitch = Math.atan2(dy, distXZ) * 180 / Math.PI;
    let pitch = Math.max(-15, Math.min(0, basePitch));
    pitch += THREE.MathUtils.randFloat(-5, 0);
    pitch = Math.max(-15, Math.min(0, pitch));

    const yawRad = yaw * Math.PI / 180.0;
    const pitchRad = pitch * Math.PI / 180.0;
    const lookDir = new THREE.Vector3(
        Math.cos(pitchRad) * Math.cos(yawRad),
        Math.sin(pitchRad),
        Math.cos(pitchRad) * Math.sin(yawRad)
    );
    camera.lookAt(camera.position.clone().add(lookDir));
    camera.updateMatrixWorld();

    const target = camera.position.clone().add(lookDir.multiplyScalar(5));
    controls.target.copy(target);
    controls.update();

    updateCameraInfo();
}

async function init() {
    updateEnvironmentFromUI();

    const textureLoader = new THREE.TextureLoader();
    try {
        const backgroundTexture = await textureLoader.loadAsync('assets/background.jpg');
        backgroundTexture.mapping = THREE.EquirectangularReflectionMapping;
        backgroundTexture.colorSpace = THREE.SRGBColorSpace;
        scene.background = backgroundTexture;
    } catch (error) {
        console.warn('Failed to load background:', error);
    }

    await spawner.loadAssets('assets/field.glb', 'assets/piece.glb');
    fieldBounds = spawner.getFieldBounds();
    randomizeScene();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updateCameraInfo();
    noisePass.uniforms["time"].value += 0.01;
    composer.render();
}

// Launch
init();
animate();
