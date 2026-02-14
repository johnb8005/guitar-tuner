import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { getAudioContext, getAnalyser } from "./audio";

type VisualizerProps = {
  isPlaying: boolean;
  genre: string;
  mode: string;
};

// Color palettes per genre - more vibrant and diverse
const genreColors: Record<string, {
  primary: THREE.Color;
  secondary: THREE.Color;
  accent: THREE.Color;
  background: THREE.Color;
  glow: THREE.Color;
}> = {
  pop: {
    primary: new THREE.Color(0x00d4ff),
    secondary: new THREE.Color(0xff6b9d),
    accent: new THREE.Color(0xffd93d),
    background: new THREE.Color(0x0a0a1a),
    glow: new THREE.Color(0x00ffff),
  },
  rock: {
    primary: new THREE.Color(0xff4444),
    secondary: new THREE.Color(0xff8800),
    accent: new THREE.Color(0xffdd00),
    background: new THREE.Color(0x1a0505),
    glow: new THREE.Color(0xff6600),
  },
  jazz: {
    primary: new THREE.Color(0x9b59b6),
    secondary: new THREE.Color(0x3498db),
    accent: new THREE.Color(0xe74c3c),
    background: new THREE.Color(0x0d0a15),
    glow: new THREE.Color(0xaa66ff),
  },
  blues: {
    primary: new THREE.Color(0x2980b9),
    secondary: new THREE.Color(0x1abc9c),
    accent: new THREE.Color(0xf39c12),
    background: new THREE.Color(0x051015),
    glow: new THREE.Color(0x00aaff),
  },
  classical: {
    primary: new THREE.Color(0xf5f5dc),
    secondary: new THREE.Color(0xdaa520),
    accent: new THREE.Color(0x8b4513),
    background: new THREE.Color(0x0f0d08),
    glow: new THREE.Color(0xffd700),
  },
};

// Mode affects visual behavior
const defaultModeVibe = { intensity: 0.8, chaos: 0.3, speed: 1.0 };
const modeVibes: Record<string, { intensity: number; chaos: number; speed: number }> = {
  ionian: { intensity: 0.8, chaos: 0.3, speed: 1.0 },
  dorian: { intensity: 0.7, chaos: 0.5, speed: 0.9 },
  phrygian: { intensity: 0.9, chaos: 0.7, speed: 1.2 },
  lydian: { intensity: 0.6, chaos: 0.4, speed: 0.8 },
  mixolydian: { intensity: 0.85, chaos: 0.5, speed: 1.1 },
  aeolian: { intensity: 0.75, chaos: 0.4, speed: 0.85 },
  locrian: { intensity: 0.95, chaos: 0.9, speed: 1.3 },
};

export function Visualizer({ isPlaying, genre, mode }: VisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);

  // Main visual elements
  const orbsRef = useRef<THREE.Mesh[]>([]);
  const ringsRef = useRef<THREE.Mesh[]>([]);
  const centerPieceRef = useRef<THREE.Group | null>(null);
  const particleSystemsRef = useRef<THREE.Points[]>([]);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const linesRef = useRef<THREE.Line[]>([]);
  const lightsRef = useRef<THREE.PointLight[]>([]);

  const timeRef = useRef(0);
  const [visualMode, setVisualMode] = useState(0);

  // Cycle visual modes
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setVisualMode(m => (m + 1) % 3);
    }, 8000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const colors = genreColors[genre] ?? genreColors.pop!;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(colors.background.getHex(), 0.025);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 8, 20);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(colors.background.getHex(), 1);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Ambient lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    // Dynamic point lights
    const lights: THREE.PointLight[] = [];
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(
        i % 2 === 0 ? colors.primary.getHex() : colors.secondary.getHex(),
        1,
        40
      );
      const angle = (i / 4) * Math.PI * 2;
      light.position.set(Math.cos(angle) * 15, 8, Math.sin(angle) * 15);
      scene.add(light);
      lights.push(light);
    }
    lightsRef.current = lights;

    // ============ ORBITING ORBS ============
    const orbs: THREE.Mesh[] = [];
    const orbGeometries = [
      new THREE.IcosahedronGeometry(1, 2),
      new THREE.OctahedronGeometry(1.2, 1),
      new THREE.DodecahedronGeometry(0.9, 1),
      new THREE.SphereGeometry(1, 16, 16),
    ];

    for (let i = 0; i < 12; i++) {
      const geo = orbGeometries[i % orbGeometries.length];
      const mat = new THREE.MeshPhongMaterial({
        color: i % 3 === 0 ? colors.primary : i % 3 === 1 ? colors.secondary : colors.accent,
        emissive: colors.glow,
        emissiveIntensity: 0.15,
        shininess: 100,
        transparent: true,
        opacity: 0.85,
        wireframe: i % 4 === 0,
      });
      const mesh = new THREE.Mesh(geo, mat);

      const angle = (i / 12) * Math.PI * 2;
      const radius = 7 + (i % 3) * 2;
      const height = (i % 4 - 1.5) * 2;
      mesh.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      mesh.userData = {
        baseRadius: radius,
        baseY: height,
        index: i,
        angle,
        orbitSpeed: 0.3 + Math.random() * 0.3,
        pulsePhase: Math.random() * Math.PI * 2
      };
      scene.add(mesh);
      orbs.push(mesh);
    }
    orbsRef.current = orbs;

    // ============ ROTATING RINGS ============
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const ringGeo = new THREE.TorusGeometry(3 + i * 1.5, 0.08, 8, 64);
      const ringMat = new THREE.MeshPhongMaterial({
        color: colors.secondary,
        emissive: colors.glow,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + (i * 0.2 - 0.4);
      ring.userData = { rotationSpeed: 0.02 - i * 0.003, index: i };
      scene.add(ring);
      rings.push(ring);
    }
    ringsRef.current = rings;

    // ============ CENTER PIECE ============
    const centerGroup = new THREE.Group();

    // Core sphere
    const coreGeo = new THREE.SphereGeometry(1.5, 32, 32);
    const coreMat = new THREE.MeshPhongMaterial({
      color: colors.accent,
      emissive: colors.glow,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.9,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    centerGroup.add(core);

    // Inner torus knot
    const knotGeo = new THREE.TorusKnotGeometry(2, 0.3, 100, 16);
    const knotMat = new THREE.MeshPhongMaterial({
      color: colors.primary,
      emissive: colors.secondary,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7,
      wireframe: true,
    });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    centerGroup.add(knot);

    // Outer icosahedron shell
    const shellGeo = new THREE.IcosahedronGeometry(3.5, 1);
    const shellMat = new THREE.MeshPhongMaterial({
      color: colors.secondary,
      emissive: colors.accent,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.3,
      wireframe: true,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    centerGroup.add(shell);

    scene.add(centerGroup);
    centerPieceRef.current = centerGroup;

    // ============ PARTICLE SYSTEMS ============
    const particleSystems: THREE.Points[] = [];

    // Melody particles (high, sparkly)
    const melodyCount = 300;
    const melodyGeo = new THREE.BufferGeometry();
    const melodyPos = new Float32Array(melodyCount * 3);
    const melodyColors = new Float32Array(melodyCount * 3);
    for (let i = 0; i < melodyCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 12 + Math.random() * 8;
      melodyPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      melodyPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) + 5;
      melodyPos[i * 3 + 2] = r * Math.cos(phi);
      melodyColors[i * 3] = colors.accent.r;
      melodyColors[i * 3 + 1] = colors.accent.g;
      melodyColors[i * 3 + 2] = colors.accent.b;
    }
    melodyGeo.setAttribute("position", new THREE.BufferAttribute(melodyPos, 3));
    melodyGeo.setAttribute("color", new THREE.BufferAttribute(melodyColors, 3));
    const melodyMat = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const melodyParticles = new THREE.Points(melodyGeo, melodyMat);
    melodyParticles.userData = { type: "melody" };
    scene.add(melodyParticles);
    particleSystems.push(melodyParticles);

    // Bass particles (low, pulsing)
    const bassCount = 200;
    const bassGeo = new THREE.BufferGeometry();
    const bassPos = new Float32Array(bassCount * 3);
    const bassColors = new Float32Array(bassCount * 3);
    for (let i = 0; i < bassCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 15;
      bassPos[i * 3] = Math.cos(angle) * r;
      bassPos[i * 3 + 1] = -3 + Math.random() * 2;
      bassPos[i * 3 + 2] = Math.sin(angle) * r;
      bassColors[i * 3] = colors.primary.r;
      bassColors[i * 3 + 1] = colors.primary.g;
      bassColors[i * 3 + 2] = colors.primary.b;
    }
    bassGeo.setAttribute("position", new THREE.BufferAttribute(bassPos, 3));
    bassGeo.setAttribute("color", new THREE.BufferAttribute(bassColors, 3));
    const bassMat = new THREE.PointsMaterial({
      size: 0.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const bassParticles = new THREE.Points(bassGeo, bassMat);
    bassParticles.userData = { type: "bass" };
    scene.add(bassParticles);
    particleSystems.push(bassParticles);

    // Ambient dust particles
    const dustCount = 500;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 50;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      size: 0.08,
      color: colors.glow,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.userData = { type: "dust" };
    scene.add(dust);
    particleSystems.push(dust);

    particleSystemsRef.current = particleSystems;

    // ============ ENERGY LINES ============
    const lines: THREE.Line[] = [];
    for (let i = 0; i < 8; i++) {
      const points: THREE.Vector3[] = [];
      const segments = 30;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const angle = (i / 8) * Math.PI * 2;
        const spiralAngle = angle + t * Math.PI * 2;
        const r = 3 + t * 10;
        points.push(new THREE.Vector3(
          Math.cos(spiralAngle) * r,
          t * 15 - 5,
          Math.sin(spiralAngle) * r
        ));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: i % 2 === 0 ? colors.primary : colors.secondary,
        transparent: true,
        opacity: 0.4,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.userData = { index: i, basePoints: points.map(p => p.clone()) };
      scene.add(line);
      lines.push(line);
    }
    linesRef.current = lines;

    // ============ GROUND GRID ============
    const groundGeo = new THREE.PlaneGeometry(60, 60, 60, 60);
    const groundMat = new THREE.MeshBasicMaterial({
      color: colors.primary,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -6;
    scene.add(ground);
    groundRef.current = ground;

  }, [genre]);

  // Animation loop
  const animate = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const analyser = getAnalyser();
    let frequencyData = new Uint8Array(128);
    let bassLevel = 0;
    let midLevel = 0;
    let highLevel = 0;
    let avgLevel = 0;

    if (analyser && isPlaying) {
      frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);

      const quarter = Math.floor(frequencyData.length / 4);
      bassLevel = frequencyData.slice(0, quarter).reduce((a, b) => a + b, 0) / (quarter * 255);
      midLevel = frequencyData.slice(quarter, quarter * 2).reduce((a, b) => a + b, 0) / (quarter * 255);
      highLevel = frequencyData.slice(quarter * 2, quarter * 3).reduce((a, b) => a + b, 0) / (quarter * 255);
      avgLevel = (bassLevel + midLevel + highLevel) / 3;
    }

    timeRef.current += 0.016;
    const time = timeRef.current;
    const modeVibe = modeVibes[mode] ?? defaultModeVibe;
    const colors = genreColors[genre] ?? genreColors.pop!;

    // ============ ANIMATE ORBS ============
    orbsRef.current.forEach((orb) => {
      const { baseRadius, baseY, angle, orbitSpeed, pulsePhase, index } = orb.userData;

      // Orbit with audio modulation
      const newAngle = angle + time * orbitSpeed * modeVibe.speed;
      const audioRadius = baseRadius + (isPlaying ? bassLevel * 4 : 0);

      orb.position.x = Math.cos(newAngle) * audioRadius;
      orb.position.z = Math.sin(newAngle) * audioRadius;

      // Vertical bounce based on frequency
      const freqBand = Math.floor((index / 12) * frequencyData.length);
      const freqValue = frequencyData[freqBand] / 255 || 0;
      orb.position.y = baseY + Math.sin(time * 2 + pulsePhase) * 1 + freqValue * 5 * modeVibe.intensity;

      // Rotation
      orb.rotation.x += 0.01 + freqValue * 0.05;
      orb.rotation.y += 0.015 * modeVibe.speed;

      // Scale pulse
      const scale = 0.7 + freqValue * 0.8 + Math.sin(time * 3 + pulsePhase) * 0.1;
      orb.scale.setScalar(scale);

      // Emissive pulse
      const mat = orb.material as THREE.MeshPhongMaterial;
      mat.emissiveIntensity = 0.1 + freqValue * 0.6;
    });

    // ============ ANIMATE RINGS ============
    ringsRef.current.forEach((ring, i) => {
      const { rotationSpeed } = ring.userData;
      ring.rotation.z += rotationSpeed * (1 + midLevel * 2) * modeVibe.speed;

      // Scale with bass
      const scale = 1 + bassLevel * 0.3 * modeVibe.intensity;
      ring.scale.setScalar(scale);

      // Wobble
      ring.rotation.x = Math.PI / 2 + Math.sin(time + i) * 0.1 * (1 + avgLevel);

      const mat = ring.material as THREE.MeshPhongMaterial;
      mat.opacity = 0.4 + midLevel * 0.4;
      mat.emissiveIntensity = 0.2 + avgLevel * 0.5;
    });

    // ============ ANIMATE CENTER PIECE ============
    if (centerPieceRef.current) {
      const group = centerPieceRef.current;

      // Main rotation
      group.rotation.y += 0.005 * modeVibe.speed;
      group.rotation.x = Math.sin(time * 0.5) * 0.1;

      // Scale with bass
      const centerScale = 1 + bassLevel * 0.4 * modeVibe.intensity;
      group.scale.setScalar(centerScale);

      // Animate children
      group.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh) {
          child.rotation.y += (0.01 + i * 0.005) * (1 + avgLevel);
          child.rotation.x += 0.005 * (1 + avgLevel);

          const mat = child.material as THREE.MeshPhongMaterial;
          mat.emissiveIntensity = 0.3 + avgLevel * 0.7;
        }
      });
    }

    // ============ ANIMATE PARTICLES ============
    particleSystemsRef.current.forEach((particles) => {
      const type = particles.userData.type;
      const positions = particles.geometry.attributes.position.array as Float32Array;

      if (type === "melody") {
        // Sparkle and swirl with highs
        particles.rotation.y += 0.002 + highLevel * 0.02;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i + 1] += Math.sin(time * 3 + i * 0.01) * 0.02 * (1 + highLevel * 2);
        }
        const mat = particles.material as THREE.PointsMaterial;
        mat.opacity = 0.4 + highLevel * 0.6;
        mat.size = 0.15 + highLevel * 0.3;
      } else if (type === "bass") {
        // Pulse outward with bass
        particles.rotation.y -= 0.001;
        for (let i = 0; i < positions.length; i += 3) {
          const dist = Math.sqrt(positions[i] ** 2 + positions[i + 2] ** 2);
          const pulseOffset = Math.sin(time * 4 - dist * 0.1) * bassLevel * 0.5;
          positions[i + 1] = -3 + pulseOffset + Math.sin(time + i) * 0.3;
        }
        const mat = particles.material as THREE.PointsMaterial;
        mat.opacity = 0.3 + bassLevel * 0.7;
        mat.size = 0.3 + bassLevel * 0.4;
      } else if (type === "dust") {
        // Gentle drift
        particles.rotation.y += 0.0003;
        particles.rotation.x += 0.0001;
        const mat = particles.material as THREE.PointsMaterial;
        mat.opacity = 0.2 + avgLevel * 0.3;
      }

      particles.geometry.attributes.position.needsUpdate = true;
    });

    // ============ ANIMATE ENERGY LINES ============
    linesRef.current.forEach((line) => {
      const { index, basePoints } = line.userData;
      const positions = line.geometry.attributes.position.array as Float32Array;

      for (let j = 0; j < basePoints.length; j++) {
        const base = basePoints[j];
        const wave = Math.sin(time * 2 + j * 0.3 + index) * (0.5 + midLevel * 2);
        positions[j * 3] = base.x + Math.cos(time + j * 0.1) * wave;
        positions[j * 3 + 1] = base.y + Math.sin(time * 1.5 + j * 0.2) * wave;
        positions[j * 3 + 2] = base.z + Math.sin(time + j * 0.15) * wave;
      }
      line.geometry.attributes.position.needsUpdate = true;

      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = 0.2 + avgLevel * 0.5;
    });

    // ============ ANIMATE GROUND ============
    if (groundRef.current) {
      const positions = groundRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 1];
        const dist = Math.sqrt(x * x + z * z);
        const wave = Math.sin(dist * 0.3 - time * 3) * bassLevel * 2 * modeVibe.intensity;
        const ripple = Math.sin(dist * 0.5 - time * 2) * midLevel * 1;
        positions[i + 2] = wave + ripple;
      }
      groundRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // ============ ANIMATE LIGHTS ============
    lightsRef.current.forEach((light, i) => {
      const angle = (i / 4) * Math.PI * 2 + time * 0.3;
      light.position.x = Math.cos(angle) * (12 + bassLevel * 5);
      light.position.z = Math.sin(angle) * (12 + bassLevel * 5);
      light.position.y = 6 + Math.sin(time * 2 + i) * 3;
      light.intensity = 0.8 + avgLevel * 1.5;
    });

    // ============ CAMERA MOVEMENT ============
    const camera = cameraRef.current;
    const camRadius = 18 + bassLevel * 5;
    const camAngle = time * 0.15 * modeVibe.speed;

    // Different camera behaviors based on visualMode
    if (visualMode === 0) {
      // Orbit
      camera.position.x = Math.sin(camAngle) * camRadius;
      camera.position.z = Math.cos(camAngle) * camRadius;
      camera.position.y = 8 + Math.sin(time * 0.5) * 3 + bassLevel * 4;
    } else if (visualMode === 1) {
      // High angle
      camera.position.x = Math.sin(camAngle * 0.5) * 10;
      camera.position.z = Math.cos(camAngle * 0.5) * 10;
      camera.position.y = 20 + bassLevel * 5;
    } else {
      // Dynamic zoom
      const zoom = 15 + Math.sin(time * 0.3) * 5 - avgLevel * 8;
      camera.position.x = Math.sin(camAngle) * zoom;
      camera.position.z = Math.cos(camAngle) * zoom;
      camera.position.y = 5 + bassLevel * 6;
    }
    camera.lookAt(0, bassLevel * 3, 0);

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [isPlaying, mode, genre, visualMode]);

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
      // Dispose all geometries and materials
      orbsRef.current.forEach(mesh => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      ringsRef.current.forEach(mesh => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      particleSystemsRef.current.forEach(particles => {
        particles.geometry.dispose();
        (particles.material as THREE.Material).dispose();
      });
      linesRef.current.forEach(line => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
      });
      if (groundRef.current) {
        groundRef.current.geometry.dispose();
        (groundRef.current.material as THREE.Material).dispose();
      }
      if (centerPieceRef.current) {
        centerPieceRef.current.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
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
    const colors = genreColors[genre] ?? genreColors.pop!;

    orbsRef.current.forEach((orb, i) => {
      const mat = orb.material as THREE.MeshPhongMaterial;
      mat.color.copy(i % 3 === 0 ? colors.primary : i % 3 === 1 ? colors.secondary : colors.accent);
      mat.emissive.copy(colors.glow);
    });

    ringsRef.current.forEach(ring => {
      const mat = ring.material as THREE.MeshPhongMaterial;
      mat.color.copy(colors.secondary);
      mat.emissive.copy(colors.glow);
    });

    if (centerPieceRef.current) {
      centerPieceRef.current.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshPhongMaterial;
          mat.color.copy(i === 0 ? colors.accent : i === 1 ? colors.primary : colors.secondary);
          mat.emissive.copy(i === 0 ? colors.glow : colors.secondary);
        }
      });
    }

    particleSystemsRef.current.forEach(particles => {
      const type = particles.userData.type;
      if (type === "dust") {
        const mat = particles.material as THREE.PointsMaterial;
        mat.color.copy(colors.glow);
      } else {
        const colorArray = particles.geometry.attributes.color.array as Float32Array;
        const targetColor = type === "melody" ? colors.accent : colors.primary;
        for (let i = 0; i < colorArray.length; i += 3) {
          colorArray[i] = targetColor.r;
          colorArray[i + 1] = targetColor.g;
          colorArray[i + 2] = targetColor.b;
        }
        particles.geometry.attributes.color.needsUpdate = true;
      }
    });

    linesRef.current.forEach((line, i) => {
      const mat = line.material as THREE.LineBasicMaterial;
      mat.color.copy(i % 2 === 0 ? colors.primary : colors.secondary);
    });

    if (groundRef.current) {
      const mat = groundRef.current.material as THREE.MeshBasicMaterial;
      mat.color.copy(colors.primary);
    }

    lightsRef.current.forEach((light, i) => {
      light.color.copy(i % 2 === 0 ? colors.primary : colors.secondary);
    });

    if (sceneRef.current) {
      sceneRef.current.fog = new THREE.FogExp2(colors.background.getHex(), 0.025);
    }
    if (rendererRef.current) {
      rendererRef.current.setClearColor(colors.background.getHex(), 1);
    }
  }, [genre]);

  return (
    <div
      ref={containerRef}
      className="w-full h-72 sm:h-96 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ background: `linear-gradient(to bottom, ${genreColors[genre]?.background.getStyle() || '#000011'}, #000000)` }}
    />
  );
}
