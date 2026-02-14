import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { getAudioContext, getAnalyser } from "./audio";

type VisualizerProps = {
  isPlaying: boolean;
  genre: string;
  mode: string;
};

// Color palettes per genre
const genreColors: Record<string, { primary: THREE.Color; secondary: THREE.Color; accent: THREE.Color }> = {
  pop: {
    primary: new THREE.Color(0x00d4ff),
    secondary: new THREE.Color(0xff6b9d),
    accent: new THREE.Color(0xffd93d),
  },
  rock: {
    primary: new THREE.Color(0xff4444),
    secondary: new THREE.Color(0xff8800),
    accent: new THREE.Color(0xffdd00),
  },
  jazz: {
    primary: new THREE.Color(0x9b59b6),
    secondary: new THREE.Color(0x3498db),
    accent: new THREE.Color(0xe74c3c),
  },
  blues: {
    primary: new THREE.Color(0x2980b9),
    secondary: new THREE.Color(0x1abc9c),
    accent: new THREE.Color(0xf39c12),
  },
  classical: {
    primary: new THREE.Color(0xf5f5dc),
    secondary: new THREE.Color(0xdaa520),
    accent: new THREE.Color(0x8b4513),
  },
};

// Mode affects the visual mood
const modeVibes: Record<string, { intensity: number; chaos: number }> = {
  ionian: { intensity: 0.8, chaos: 0.3 },
  dorian: { intensity: 0.7, chaos: 0.5 },
  phrygian: { intensity: 0.9, chaos: 0.7 },
  lydian: { intensity: 0.6, chaos: 0.4 },
  mixolydian: { intensity: 0.85, chaos: 0.5 },
  aeolian: { intensity: 0.75, chaos: 0.4 },
  locrian: { intensity: 0.95, chaos: 0.9 },
};

export function Visualizer({ isPlaying, genre, mode }: VisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const particlesRef = useRef<THREE.Points | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const timeRef = useRef(0);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000011, 0.02);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000011, 1);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x00d4ff, 1, 50);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff6b9d, 1, 50);
    pointLight2.position.set(-10, 10, -10);
    scene.add(pointLight2);

    // Create main meshes (geometric shapes for different frequency bands)
    const colors = genreColors[genre] || genreColors.pop;
    const geometries = [
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.OctahedronGeometry(1.2, 0),
      new THREE.TetrahedronGeometry(1, 0),
      new THREE.DodecahedronGeometry(0.9, 0),
      new THREE.IcosahedronGeometry(1.1, 0),
    ];

    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const geo = geometries[i % geometries.length];
      const mat = new THREE.MeshPhongMaterial({
        color: i % 2 === 0 ? colors.primary : colors.secondary,
        emissive: colors.accent,
        emissiveIntensity: 0.1,
        shininess: 100,
        transparent: true,
        opacity: 0.85,
        wireframe: i % 3 === 0,
      });
      const mesh = new THREE.Mesh(geo, mat);

      // Arrange in a circle
      const angle = (i / 8) * Math.PI * 2;
      const radius = 6;
      mesh.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      mesh.userData = { baseY: 0, index: i, angle };
      scene.add(mesh);
      meshes.push(mesh);
    }
    meshesRef.current = meshes;

    // Center piece - larger, rotating
    const centerGeo = new THREE.TorusKnotGeometry(1.5, 0.4, 100, 16);
    const centerMat = new THREE.MeshPhongMaterial({
      color: colors.accent,
      emissive: colors.primary,
      emissiveIntensity: 0.3,
      shininess: 150,
      transparent: true,
      opacity: 0.9,
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    centerMesh.userData = { isCenter: true };
    scene.add(centerMesh);
    meshes.push(centerMesh);

    // Particle system for melody/sparkles
    const particleCount = 500;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 8 + Math.random() * 12;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) - 2;
      positions[i * 3 + 2] = r * Math.cos(phi);

      particleColors[i * 3] = colors.primary.r;
      particleColors[i * 3 + 1] = colors.primary.g;
      particleColors[i * 3 + 2] = colors.primary.b;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
    particlesRef.current = particles;

    // Ground plane with grid
    const groundGeo = new THREE.PlaneGeometry(50, 50, 50, 50);
    const groundMat = new THREE.MeshBasicMaterial({
      color: colors.primary,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    scene.add(ground);
    groundRef.current = ground;

  }, [genre]);

  // Animation loop
  const animate = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const analyser = getAnalyser();
    let frequencyData = new Uint8Array(64);
    let bassLevel = 0;
    let midLevel = 0;
    let highLevel = 0;

    if (analyser && isPlaying) {
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);

      // Calculate frequency bands
      const third = Math.floor(frequencyData.length / 3);
      bassLevel = frequencyData.slice(0, third).reduce((a, b) => a + b, 0) / (third * 255);
      midLevel = frequencyData.slice(third, third * 2).reduce((a, b) => a + b, 0) / (third * 255);
      highLevel = frequencyData.slice(third * 2).reduce((a, b) => a + b, 0) / (third * 255);
    }

    timeRef.current += 0.016; // ~60fps
    const time = timeRef.current;
    const modeVibe = modeVibes[mode] || modeVibes.ionian;

    // Animate meshes
    meshesRef.current.forEach((mesh, i) => {
      if (mesh.userData.isCenter) {
        // Center torus knot
        mesh.rotation.x += 0.005 + midLevel * 0.02;
        mesh.rotation.y += 0.008 + midLevel * 0.015;
        const scale = 1 + bassLevel * 0.5 * modeVibe.intensity;
        mesh.scale.setScalar(scale);

        // Pulse emissive
        const mat = mesh.material as THREE.MeshPhongMaterial;
        mat.emissiveIntensity = 0.2 + midLevel * 0.8;
      } else {
        // Orbiting shapes
        const angle = mesh.userData.angle + time * 0.3;
        const radius = 6 + Math.sin(time * 2 + i) * (isPlaying ? bassLevel * 2 : 0.5);

        mesh.position.x = Math.cos(angle) * radius;
        mesh.position.z = Math.sin(angle) * radius;

        // Bounce based on frequency
        const freqIndex = Math.floor((i / 8) * frequencyData.length);
        const freqValue = frequencyData[freqIndex] / 255 || 0;
        mesh.position.y = mesh.userData.baseY + freqValue * 4 * modeVibe.intensity;

        // Rotate
        mesh.rotation.x += 0.01 + freqValue * 0.05 * modeVibe.chaos;
        mesh.rotation.y += 0.015 + freqValue * 0.03;

        // Scale pulse
        const baseScale = 0.8 + freqValue * 0.8;
        mesh.scale.setScalar(baseScale);

        // Emissive pulse
        const mat = mesh.material as THREE.MeshPhongMaterial;
        mat.emissiveIntensity = 0.1 + freqValue * 0.5;
      }
    });

    // Animate particles
    if (particlesRef.current) {
      particlesRef.current.rotation.y += 0.001 + highLevel * 0.01;
      particlesRef.current.rotation.x += 0.0005;

      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        // Subtle breathing effect
        const breathe = Math.sin(time * 2 + i * 0.01) * (isPlaying ? highLevel * 0.5 : 0.1);
        positions[i + 1] += breathe * 0.02;
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;

      // Particle opacity based on high frequencies
      const mat = particlesRef.current.material as THREE.PointsMaterial;
      mat.opacity = 0.4 + highLevel * 0.6;
    }

    // Animate ground (bass ripple effect)
    if (groundRef.current) {
      const positions = groundRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 1]; // Note: z is stored in y due to rotation
        const dist = Math.sqrt(x * x + z * z);
        const wave = Math.sin(dist * 0.5 - time * 3) * bassLevel * 2 * modeVibe.intensity;
        positions[i + 2] = wave; // Modify the "up" direction
      }
      groundRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // Camera subtle movement
    const camera = cameraRef.current;
    camera.position.x = Math.sin(time * 0.2) * 3;
    camera.position.y = 5 + Math.sin(time * 0.3) * 2 + bassLevel * 2;
    camera.lookAt(0, bassLevel * 2, 0);

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [isPlaying, mode]);

  // Setup and cleanup
  useEffect(() => {
    initScene();

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      // Dispose geometries and materials
      meshesRef.current.forEach(mesh => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      if (particlesRef.current) {
        particlesRef.current.geometry.dispose();
        (particlesRef.current.material as THREE.Material).dispose();
      }
      if (groundRef.current) {
        groundRef.current.geometry.dispose();
        (groundRef.current.material as THREE.Material).dispose();
      }
    };
  }, [initScene]);

  // Start/stop animation
  useEffect(() => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
    animate();
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [animate]);

  // Update colors when genre changes
  useEffect(() => {
    const colors = genreColors[genre] || genreColors.pop;

    meshesRef.current.forEach((mesh, i) => {
      const mat = mesh.material as THREE.MeshPhongMaterial;
      if (mesh.userData.isCenter) {
        mat.color.copy(colors.accent);
        mat.emissive.copy(colors.primary);
      } else {
        mat.color.copy(i % 2 === 0 ? colors.primary : colors.secondary);
        mat.emissive.copy(colors.accent);
      }
    });

    if (groundRef.current) {
      const mat = groundRef.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(colors.primary);
    }

    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.color.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] = colors.primary.r;
        positions[i + 1] = colors.primary.g;
        positions[i + 2] = colors.primary.b;
      }
      particlesRef.current.geometry.attributes.color.needsUpdate = true;
    }
  }, [genre]);

  return (
    <div
      ref={containerRef}
      className="w-full h-64 sm:h-80 rounded-xl overflow-hidden"
      style={{ background: "linear-gradient(to bottom, #000011, #001122)" }}
    />
  );
}
