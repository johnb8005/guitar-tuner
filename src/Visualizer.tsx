import { useRef, useEffect, useCallback, useState } from "react";
import * as THREE from "three";
import { getAnalyser } from "./audio";

type VisualizerProps = {
  isPlaying: boolean;
  genre: string;
  mode: string;
  seed: number; // Changes when Generate is clicked
};

// Color palettes
const palettes = [
  { bg: 0x0a0a1a, colors: [0x00d4ff, 0xff6b9d, 0xffd93d, 0x00ff88] }, // Neon
  { bg: 0x1a0505, colors: [0xff4444, 0xff8800, 0xffdd00, 0xff2222] }, // Fire
  { bg: 0x0d0a15, colors: [0x9b59b6, 0x3498db, 0xe74c3c, 0xaa66ff] }, // Purple haze
  { bg: 0x051015, colors: [0x2980b9, 0x1abc9c, 0x00ff88, 0x00aaff] }, // Ocean
  { bg: 0x0f0d08, colors: [0xf5f5dc, 0xdaa520, 0xffd700, 0xffaa00] }, // Gold
  { bg: 0x000a00, colors: [0x00ff00, 0x00dd00, 0x00ff44, 0x88ff00] }, // Matrix
  { bg: 0x0a0a0a, colors: [0xffffff, 0xcccccc, 0x888888, 0xaaaaaa] }, // Mono
  { bg: 0x150505, colors: [0xff0066, 0xff00ff, 0x6600ff, 0xff3399] }, // Synthwave
];

// ============ VISUALIZATION MODES ============

type VisualizationMode = {
  name: string;
  init: (scene: THREE.Scene, palette: typeof palettes[0]) => any;
  animate: (state: any, time: number, bass: number, mid: number, high: number, freq: Uint8Array) => void;
  cleanup: (state: any) => void;
};

// MODE 1: Classic Equalizer Bars
const equalizerMode: VisualizationMode = {
  name: "Equalizer",
  init: (scene, palette) => {
    const bars: THREE.Mesh[] = [];
    const count = 32;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
      const mat = new THREE.MeshPhongMaterial({
        color: palette.colors[i % palette.colors.length],
        emissive: palette.colors[i % palette.colors.length],
        emissiveIntensity: 0.3,
      });
      const bar = new THREE.Mesh(geo, mat);
      bar.position.x = (i - count / 2) * 1;
      bar.position.y = 0;
      scene.add(bar);
      bars.push(bar);
    }
    return { bars };
  },
  animate: (state, time, bass, mid, high, freq) => {
    state.bars.forEach((bar: THREE.Mesh, i: number) => {
      const value = freq[Math.floor(i * freq.length / state.bars.length)] / 255;
      const height = 0.5 + value * 15;
      bar.scale.y = height;
      bar.position.y = height / 2 - 3;
      const mat = bar.material as THREE.MeshPhongMaterial;
      mat.emissiveIntensity = 0.2 + value * 0.8;
    });
  },
  cleanup: (state) => {
    state.bars.forEach((bar: THREE.Mesh) => {
      bar.geometry.dispose();
      (bar.material as THREE.Material).dispose();
    });
  },
};

// MODE 2: Circular Spectrum
const circularMode: VisualizationMode = {
  name: "Circular",
  init: (scene, palette) => {
    const bars: THREE.Mesh[] = [];
    const count = 64;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.3, 2, 0.3);
      const mat = new THREE.MeshPhongMaterial({
        color: palette.colors[i % palette.colors.length],
        emissive: palette.colors[i % palette.colors.length],
        emissiveIntensity: 0.3,
      });
      const bar = new THREE.Mesh(geo, mat);
      const angle = (i / count) * Math.PI * 2;
      bar.position.x = Math.cos(angle) * 5;
      bar.position.z = Math.sin(angle) * 5;
      bar.rotation.y = -angle;
      bar.userData = { angle, baseRadius: 5 };
      scene.add(bar);
      bars.push(bar);
    }
    return { bars };
  },
  animate: (state, time, bass, mid, high, freq) => {
    state.bars.forEach((bar: THREE.Mesh, i: number) => {
      const value = freq[Math.floor(i * freq.length / state.bars.length)] / 255;
      bar.scale.y = 0.5 + value * 8;
      const { angle, baseRadius } = bar.userData;
      const r = baseRadius + value * 3;
      bar.position.x = Math.cos(angle + time * 0.5) * r;
      bar.position.z = Math.sin(angle + time * 0.5) * r;
      bar.rotation.y = -(angle + time * 0.5);
      const mat = bar.material as THREE.MeshPhongMaterial;
      mat.emissiveIntensity = 0.1 + value * 0.9;
    });
  },
  cleanup: (state) => {
    state.bars.forEach((bar: THREE.Mesh) => {
      bar.geometry.dispose();
      (bar.material as THREE.Material).dispose();
    });
  },
};

// MODE 3: Particle Explosion
const particleMode: VisualizationMode = {
  name: "Particles",
  init: (scene, palette) => {
    const count = 2000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
      velocities[i * 3] = (Math.random() - 0.5) * 0.1;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
      const color = new THREE.Color(palette.colors[i % palette.colors.length]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    return { points, velocities, basePositions: positions.slice() };
  },
  animate: (state, time, bass, mid, high, freq) => {
    const positions = state.points.geometry.attributes.position.array as Float32Array;
    const explosion = bass * 2;

    for (let i = 0; i < positions.length; i += 3) {
      const dx = positions[i];
      const dy = positions[i + 1];
      const dz = positions[i + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > 0.1) {
        positions[i] += (dx / dist) * explosion * 0.3;
        positions[i + 1] += (dy / dist) * explosion * 0.3;
        positions[i + 2] += (dz / dist) * explosion * 0.3;
      }

      // Slowly return to center
      positions[i] *= 0.98;
      positions[i + 1] *= 0.98;
      positions[i + 2] *= 0.98;

      // Add some swirl
      const angle = time * 0.5;
      const x = positions[i];
      const z = positions[i + 2];
      positions[i] = x * Math.cos(0.01) - z * Math.sin(0.01);
      positions[i + 2] = x * Math.sin(0.01) + z * Math.cos(0.01);
    }

    state.points.geometry.attributes.position.needsUpdate = true;
    const mat = state.points.material as THREE.PointsMaterial;
    mat.size = 0.1 + high * 0.3;
  },
  cleanup: (state) => {
    state.points.geometry.dispose();
    (state.points.material as THREE.Material).dispose();
  },
};

// MODE 4: Waveform Tunnel
const tunnelMode: VisualizationMode = {
  name: "Tunnel",
  init: (scene, palette) => {
    const rings: THREE.Line[] = [];
    const ringCount = 30;

    for (let r = 0; r < ringCount; r++) {
      const points: THREE.Vector3[] = [];
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * 5, Math.sin(angle) * 5, -r * 2));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: palette.colors[r % palette.colors.length],
        transparent: true,
        opacity: 1 - r / ringCount * 0.7,
      });
      const ring = new THREE.Line(geo, mat);
      ring.userData = { baseZ: -r * 2, segments };
      scene.add(ring);
      rings.push(ring);
    }

    return { rings };
  },
  animate: (state, time, bass, mid, high, freq) => {
    state.rings.forEach((ring: THREE.Line, r: number) => {
      const positions = ring.geometry.attributes.position.array as Float32Array;
      const { segments } = ring.userData;

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const freqIndex = Math.floor((i / segments) * freq.length);
        const value = freq[freqIndex] / 255;
        const radius = 4 + value * 4 + Math.sin(time * 2 + r * 0.3) * bass * 2;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = Math.sin(angle) * radius;
      }

      ring.geometry.attributes.position.needsUpdate = true;
      ring.position.z = ring.userData.baseZ + (time * 10) % 60 - 30;

      if (ring.position.z > 5) {
        ring.position.z -= 60;
      }
    });
  },
  cleanup: (state) => {
    state.rings.forEach((ring: THREE.Line) => {
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    });
  },
};

// MODE 5: DNA Helix
const helixMode: VisualizationMode = {
  name: "Helix",
  init: (scene, palette) => {
    const spheres: THREE.Mesh[] = [];
    const count = 100;

    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.3, 16, 16);
      const mat = new THREE.MeshPhongMaterial({
        color: palette.colors[i % 2],
        emissive: palette.colors[i % 2],
        emissiveIntensity: 0.3,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.userData = { index: i, strand: 0 };
      scene.add(sphere);
      spheres.push(sphere);

      // Second strand
      const geo2 = new THREE.SphereGeometry(0.3, 16, 16);
      const mat2 = new THREE.MeshPhongMaterial({
        color: palette.colors[(i % 2) + 2],
        emissive: palette.colors[(i % 2) + 2],
        emissiveIntensity: 0.3,
      });
      const sphere2 = new THREE.Mesh(geo2, mat2);
      sphere2.userData = { index: i, strand: 1 };
      scene.add(sphere2);
      spheres.push(sphere2);
    }

    // Connection lines
    const lines: THREE.Line[] = [];
    for (let i = 0; i < count; i += 5) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(6);
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: palette.colors[3],
        transparent: true,
        opacity: 0.5,
      });
      const line = new THREE.Line(geo, mat);
      line.userData = { index: i };
      scene.add(line);
      lines.push(line);
    }

    return { spheres, lines };
  },
  animate: (state, time, bass, mid, high, freq) => {
    const radius = 3 + bass * 2;
    const speed = time * 2;

    state.spheres.forEach((sphere: THREE.Mesh) => {
      const { index, strand } = sphere.userData;
      const y = (index / 50) * 20 - 10 + (time * 3) % 20;
      const wrappedY = ((y + 10) % 20) - 10;
      const angle = index * 0.2 + speed + (strand * Math.PI);
      const freqIndex = Math.floor((index / 100) * freq.length);
      const pulse = freq[freqIndex] / 255;

      sphere.position.x = Math.cos(angle) * radius;
      sphere.position.z = Math.sin(angle) * radius;
      sphere.position.y = wrappedY;
      sphere.scale.setScalar(0.8 + pulse * 1.5);

      const mat = sphere.material as THREE.MeshPhongMaterial;
      mat.emissiveIntensity = 0.2 + pulse * 0.8;
    });

    state.lines.forEach((line: THREE.Line) => {
      const { index } = line.userData;
      const positions = line.geometry.attributes.position.array as Float32Array;
      const y = (index / 50) * 20 - 10 + (time * 3) % 20;
      const wrappedY = ((y + 10) % 20) - 10;
      const angle1 = index * 0.2 + speed;
      const angle2 = angle1 + Math.PI;

      positions[0] = Math.cos(angle1) * radius;
      positions[1] = wrappedY;
      positions[2] = Math.sin(angle1) * radius;
      positions[3] = Math.cos(angle2) * radius;
      positions[4] = wrappedY;
      positions[5] = Math.sin(angle2) * radius;

      line.geometry.attributes.position.needsUpdate = true;
    });
  },
  cleanup: (state) => {
    state.spheres.forEach((s: THREE.Mesh) => {
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    });
    state.lines.forEach((l: THREE.Line) => {
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    });
  },
};

// MODE 6: Geometric Pulse
const geometricMode: VisualizationMode = {
  name: "Geometric",
  init: (scene, palette) => {
    const shapes: THREE.Mesh[] = [];
    const geos = [
      new THREE.IcosahedronGeometry(2, 1),
      new THREE.OctahedronGeometry(2.5, 0),
      new THREE.TetrahedronGeometry(2, 0),
    ];

    geos.forEach((geo, i) => {
      const mat = new THREE.MeshPhongMaterial({
        color: palette.colors[i],
        emissive: palette.colors[i],
        emissiveIntensity: 0.2,
        wireframe: true,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { index: i };
      scene.add(mesh);
      shapes.push(mesh);
    });

    return { shapes };
  },
  animate: (state, time, bass, mid, high, freq) => {
    state.shapes.forEach((shape: THREE.Mesh, i: number) => {
      const levels = [bass, mid, high];
      const level = levels[i];

      shape.rotation.x = time * (0.3 + i * 0.2);
      shape.rotation.y = time * (0.4 + i * 0.1);
      shape.scale.setScalar(1 + level * 2);

      const mat = shape.material as THREE.MeshPhongMaterial;
      mat.emissiveIntensity = 0.1 + level * 0.9;
      mat.opacity = 0.4 + level * 0.6;
    });
  },
  cleanup: (state) => {
    state.shapes.forEach((s: THREE.Mesh) => {
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    });
  },
};

// MODE 7: Starfield
const starfieldMode: VisualizationMode = {
  name: "Starfield",
  init: (scene, palette) => {
    const count = 1000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 2] = Math.random() * -100;

      const color = new THREE.Color(palette.colors[Math.floor(Math.random() * palette.colors.length)]);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geo, mat);
    scene.add(stars);

    return { stars, baseSpeed: 0.5 };
  },
  animate: (state, time, bass, mid, high, freq) => {
    const positions = state.stars.geometry.attributes.position.array as Float32Array;
    const speed = state.baseSpeed + bass * 3;

    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 2] += speed;

      if (positions[i + 2] > 10) {
        positions[i + 2] = -100;
        positions[i] = (Math.random() - 0.5) * 100;
        positions[i + 1] = (Math.random() - 0.5) * 100;
      }
    }

    state.stars.geometry.attributes.position.needsUpdate = true;
    const mat = state.stars.material as THREE.PointsMaterial;
    mat.size = 0.3 + high * 1;
  },
  cleanup: (state) => {
    state.stars.geometry.dispose();
    (state.stars.material as THREE.Material).dispose();
  },
};

// MODE 8: Wave Grid
const waveGridMode: VisualizationMode = {
  name: "Wave Grid",
  init: (scene, palette) => {
    const size = 30;
    const geo = new THREE.PlaneGeometry(30, 30, size, size);
    const mat = new THREE.MeshPhongMaterial({
      color: palette.colors[0],
      emissive: palette.colors[1],
      emissiveIntensity: 0.3,
      wireframe: true,
      side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 3;
    plane.position.y = -3;
    scene.add(plane);

    return { plane, size };
  },
  animate: (state, time, bass, mid, high, freq) => {
    const positions = state.plane.geometry.attributes.position.array as Float32Array;
    const size = state.size + 1;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const freqIndex = Math.floor(Math.abs(x + 15) / 30 * freq.length);
      const freqValue = freq[freqIndex] / 255;

      const wave1 = Math.sin(x * 0.5 + time * 3) * bass * 3;
      const wave2 = Math.sin(y * 0.5 + time * 2) * mid * 2;
      const wave3 = Math.sin((x + y) * 0.3 + time * 4) * high * 2;

      positions[i + 2] = wave1 + wave2 + wave3 + freqValue * 3;
    }

    state.plane.geometry.attributes.position.needsUpdate = true;
    const mat = state.plane.material as THREE.MeshPhongMaterial;
    mat.emissiveIntensity = 0.2 + mid * 0.8;
  },
  cleanup: (state) => {
    state.plane.geometry.dispose();
    (state.plane.material as THREE.Material).dispose();
  },
};

// MODE 9: Bouncing Spheres
const bouncingMode: VisualizationMode = {
  name: "Bouncing",
  init: (scene, palette) => {
    const spheres: THREE.Mesh[] = [];
    const count = 20;

    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.5 + Math.random() * 0.5, 32, 32);
      const mat = new THREE.MeshPhongMaterial({
        color: palette.colors[i % palette.colors.length],
        emissive: palette.colors[i % palette.colors.length],
        emissiveIntensity: 0.3,
      });
      const sphere = new THREE.Mesh(geo, mat);
      sphere.position.x = (Math.random() - 0.5) * 15;
      sphere.position.z = (Math.random() - 0.5) * 15;
      sphere.position.y = Math.random() * 10;
      sphere.userData = {
        velocity: 0,
        baseX: sphere.position.x,
        baseZ: sphere.position.z,
        phase: Math.random() * Math.PI * 2,
      };
      scene.add(sphere);
      spheres.push(sphere);
    }

    // Floor
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshPhongMaterial({
      color: palette.colors[0],
      transparent: true,
      opacity: 0.3,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -5;
    scene.add(floor);

    return { spheres, floor };
  },
  animate: (state, time, bass, mid, high, freq) => {
    state.spheres.forEach((sphere: THREE.Mesh, i: number) => {
      const { phase } = sphere.userData;
      const freqIndex = Math.floor((i / state.spheres.length) * freq.length);
      const freqValue = freq[freqIndex] / 255;

      // Bounce height based on frequency
      const bounceHeight = 3 + freqValue * 8;
      sphere.position.y = -4 + Math.abs(Math.sin(time * 3 + phase)) * bounceHeight;

      // Scale pulse
      sphere.scale.setScalar(1 + freqValue * 0.5);

      const mat = sphere.material as THREE.MeshPhongMaterial;
      mat.emissiveIntensity = 0.2 + freqValue * 0.8;
    });
  },
  cleanup: (state) => {
    state.spheres.forEach((s: THREE.Mesh) => {
      s.geometry.dispose();
      (s.material as THREE.Material).dispose();
    });
    state.floor.geometry.dispose();
    (state.floor.material as THREE.Material).dispose();
  },
};

// MODE 10: Rings of Fire
const ringsOfFireMode: VisualizationMode = {
  name: "Rings",
  init: (scene, palette) => {
    const rings: THREE.Mesh[] = [];
    const count = 8;

    for (let i = 0; i < count; i++) {
      const geo = new THREE.TorusGeometry(2 + i * 0.8, 0.1, 16, 100);
      const mat = new THREE.MeshPhongMaterial({
        color: palette.colors[i % palette.colors.length],
        emissive: palette.colors[i % palette.colors.length],
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.userData = { index: i, baseRadius: 2 + i * 0.8 };
      scene.add(ring);
      rings.push(ring);
    }

    return { rings };
  },
  animate: (state, time, bass, mid, high, freq) => {
    state.rings.forEach((ring: THREE.Mesh, i: number) => {
      const { baseRadius } = ring.userData;
      const freqIndex = Math.floor((i / state.rings.length) * freq.length);
      const freqValue = freq[freqIndex] / 255;

      ring.rotation.x = time * (0.5 + i * 0.1) + Math.sin(time + i) * 0.5;
      ring.rotation.y = time * (0.3 + i * 0.05);

      const scale = 1 + freqValue * 0.5;
      ring.scale.setScalar(scale);

      const mat = ring.material as THREE.MeshPhongMaterial;
      mat.emissiveIntensity = 0.3 + freqValue * 0.7;
    });
  },
  cleanup: (state) => {
    state.rings.forEach((r: THREE.Mesh) => {
      r.geometry.dispose();
      (r.material as THREE.Material).dispose();
    });
  },
};

// All visualization modes
const visualizationModes: VisualizationMode[] = [
  equalizerMode,
  circularMode,
  particleMode,
  tunnelMode,
  helixMode,
  geometricMode,
  starfieldMode,
  waveGridMode,
  bouncingMode,
  ringsOfFireMode,
];

export function Visualizer({ isPlaying, genre, mode, seed }: VisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const stateRef = useRef<any>(null);
  const modeRef = useRef<VisualizationMode | null>(null);
  const timeRef = useRef(0);

  const [currentMode, setCurrentMode] = useState<VisualizationMode | null>(null);
  const [palette, setPalette] = useState(palettes[0]);

  // Pick random mode and palette based on seed
  useEffect(() => {
    const modeIndex = seed % visualizationModes.length;
    const paletteIndex = Math.floor(seed / 10) % palettes.length;
    setCurrentMode(visualizationModes[modeIndex]);
    setPalette(palettes[paletteIndex]);
  }, [seed]);

  // Initialize scene
  const initScene = useCallback(() => {
    if (!containerRef.current || !currentMode) return;

    // Cleanup previous
    if (stateRef.current && modeRef.current) {
      modeRef.current.cleanup(stateRef.current);
    }
    if (rendererRef.current && containerRef.current.contains(rendererRef.current.domElement)) {
      containerRef.current.removeChild(rendererRef.current.domElement);
      rendererRef.current.dispose();
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.bg);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const point1 = new THREE.PointLight(palette.colors[0], 1, 50);
    point1.position.set(10, 10, 10);
    scene.add(point1);

    const point2 = new THREE.PointLight(palette.colors[1], 1, 50);
    point2.position.set(-10, 10, -10);
    scene.add(point2);

    // Initialize visualization mode
    stateRef.current = currentMode.init(scene, palette);
    modeRef.current = currentMode;

  }, [currentMode, palette]);

  // Animation
  const animate = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !modeRef.current) {
      animationIdRef.current = requestAnimationFrame(animate);
      return;
    }

    const analyser = getAnalyser();
    let freq = new Uint8Array(128);
    let bass = 0, mid = 0, high = 0;

    if (analyser && isPlaying) {
      freq = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freq);
      const q = Math.floor(freq.length / 4);
      bass = freq.slice(0, q).reduce((a, b) => a + b, 0) / (q * 255);
      mid = freq.slice(q, q * 2).reduce((a, b) => a + b, 0) / (q * 255);
      high = freq.slice(q * 2, q * 3).reduce((a, b) => a + b, 0) / (q * 255);
    }

    timeRef.current += 0.016;

    if (stateRef.current) {
      modeRef.current.animate(stateRef.current, timeRef.current, bass, mid, high, freq);
    }

    // Gentle camera movement
    const cam = cameraRef.current;
    cam.position.x = Math.sin(timeRef.current * 0.2) * 3;
    cam.position.y = 5 + Math.sin(timeRef.current * 0.3) * 2 + bass * 3;
    cam.lookAt(0, 0, 0);

    rendererRef.current.render(sceneRef.current, cameraRef.current);
    animationIdRef.current = requestAnimationFrame(animate);
  }, [isPlaying]);

  // Setup
  useEffect(() => {
    if (currentMode) {
      initScene();
    }

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (stateRef.current && modeRef.current) {
        modeRef.current.cleanup(stateRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [initScene]);

  // Start animation
  useEffect(() => {
    if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    animate();
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
    };
  }, [animate]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full h-64 sm:h-80 rounded-xl overflow-hidden"
      />
      {currentMode && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 rounded text-xs text-white/70">
          {currentMode.name}
        </div>
      )}
    </div>
  );
}
