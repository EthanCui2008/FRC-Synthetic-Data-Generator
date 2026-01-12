export const NoiseShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "amount": { value: 0.5 }, // Noise strength
        "time": { value: 0.0 }    // Seed for noise
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
        uniform float amount;
        uniform float time;
        varying vec2 vUv;

        // Simple pseudo-random function
        float random(vec2 p) {
            return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453 + time);
        }

        void main() {
            vec4 color = texture2D( tDiffuse, vUv );
            
            // 1. Convert to Grayscale (Luma method)
            float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            
            // 2. Add Noise
            float noise = random(vUv) * amount;
            vec3 finalColor = vec3(gray + noise);

            gl_FragColor = vec4( finalColor, 1.0 );
        }
    `
};