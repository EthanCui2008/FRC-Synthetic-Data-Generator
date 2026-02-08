import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { NoiseShader } from './NoiseShader.js';

let environmentTexture = null;

// --- Scene ---
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

// --- Camera ---
export const CAMERA_FOV = 55;
export const CAMERA_WIDTH = 1920;
export const CAMERA_HEIGHT = 1200;
export const CAMERA_ASPECT = CAMERA_WIDTH / CAMERA_HEIGHT;

export const camera = new THREE.PerspectiveCamera(CAMERA_FOV, CAMERA_ASPECT, 0.1, 1000);
camera.position.set(0, 30, 30);

// --- Renderer ---
export const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true
});
renderer.setSize(CAMERA_WIDTH, CAMERA_HEIGHT);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const canvasWrapper = document.getElementById('canvas-wrapper');
canvasWrapper.appendChild(renderer.domElement);

// --- OrbitControls ---
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 0.5;
controls.maxDistance = 50;
controls.maxPolarAngle = Math.PI / 2;

// --- Lighting ---
const LIGHT_HEIGHT = 20;
const LIGHT_INTENSITY = 0.5;
const lightPositions = [
    { x: -10, z: -5 },
    { x: 10, z: -5 },
    { x: -10, z: 5 },
    { x: 10, z: 5 }
];

lightPositions.forEach((pos, index) => {
    const light = new THREE.DirectionalLight(0xffffff, LIGHT_INTENSITY);
    light.position.set(pos.x, LIGHT_HEIGHT, pos.z);
    light.target.position.set(pos.x, 0, pos.z);

    // Enable shadows on all lights
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.left = -15;
    light.shadow.camera.right = 15;
    light.shadow.camera.top = 15;
    light.shadow.camera.bottom = -15;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 50;
    light.shadow.bias = -0.001;

    scene.add(light);
    scene.add(light.target);
});

const hemisphereLight = new THREE.HemisphereLight(
    0xffffff, // Sky color (top)
    0x444444, // Ground color (bottom)
    2
);
scene.add(hemisphereLight);

// --- Environment Map (procedural top-lit for PBR material reflections) ---
export function loadEnvironment(options = {}) {
    const {
        brightness = 3.0,
        falloffPower = 2.0,
    } = options;

    // Create a procedural equirectangular environment map with light only from above
    const width = 512;
    const height = 256;
    const data = new Float32Array(width * height * 4);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;

            // Convert pixel position to spherical coordinates
            // Flip v so bottom of texture (v=1) maps to top lighting
            const v = 1.0 - (y / height);

            // Calculate intensity based on vertical position
            // v=1 (top of scene) is brightest, falls off toward bottom
            // Using cosine falloff for natural lighting feel
            const theta = v * Math.PI; // PI at bottom of scene, 0 at top
            let intensity = Math.cos(theta); // -1 at bottom, 1 at top

            // Clamp to positive values and apply power for sharper falloff
            intensity = Math.max(0, intensity);
            intensity = Math.pow(intensity, falloffPower); // Sharper falloff - light concentrated at top

            // HDR values (can exceed 1.0 for bright areas)
            const hdr = intensity * brightness; // Boost for HDR effect

            data[i] = hdr;     // R
            data[i + 1] = hdr; // G
            data[i + 2] = hdr; // B
            data[i + 3] = 1.0;        // A
        }
    }

    if (environmentTexture) {
        environmentTexture.dispose();
        environmentTexture = null;
    }

    environmentTexture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
    environmentTexture.needsUpdate = true;

    scene.environment = environmentTexture;
}

// --- Post-Processing ---
export const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

export const noisePass = new ShaderPass(NoiseShader);
noisePass.uniforms["noiseAmount"].value = 0.15;
noisePass.uniforms["grayscale"].value = 1.0;
composer.addPass(noisePass);
