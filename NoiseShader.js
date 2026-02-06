export const NoiseShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "noiseAmount": { value: 0.15 }, // Noise strength
        "grayscale": { value: 1.0 },    // 0 = color, 1 = grayscale
        "time": { value: 0.0 }          // Seed for noise
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float noiseAmount;
        uniform float grayscale;
        uniform float time;
        varying vec2 vUv;

        // Simple pseudo-random function
        float random(vec2 p) {
            return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453 + time);
        }

        void main() {
            vec4 color = texture2D( tDiffuse, vUv );

            // Convert to grayscale (Luma method)
            float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));

            // Mix between color and grayscale based on uniform
            vec3 baseColor = mix(color.rgb, vec3(gray), grayscale);

            // Add noise
            float noise = (random(vUv) - 0.5) * noiseAmount;
            vec3 finalColor = baseColor + noise;

            gl_FragColor = vec4( finalColor, 1.0 );
        }
    `
};
