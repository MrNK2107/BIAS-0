import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useScroll } from '@react-three/drei';
import * as THREE from 'three';

const MAX_PARTICLES = 3000;

export default function ExperienceScene() {
  const scroll = useScroll();
  const { camera } = useThree();

  const sceneRef = useRef<THREE.Group>(null!);
  const pointsRef = useRef<THREE.Points>(null!);
  const positionAttrRef = useRef<THREE.BufferAttribute>(null!);
  const colorAttrRef = useRef<THREE.BufferAttribute>(null!);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const reducedMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateReduced = () => setPrefersReducedMotion(reducedMedia.matches);

    updateReduced();

    reducedMedia.addEventListener('change', updateReduced);

    return () => {
      reducedMedia.removeEventListener('change', updateReduced);
    };
  }, []);

  const tmpColor = useMemo(() => new THREE.Color(), []);
  const trustCopper = useMemo(() => new THREE.Color('#C89D7C'), []); // Antique Gold
  const warningRed = useMemo(() => new THREE.Color('#A24A46'), []);  // Crimson Oxide
  const sageGreen = useMemo(() => new THREE.Color('#8FA89B'), []);   // Sage Green
  const neutralA = useMemo(() => new THREE.Color('#F3F2F1'), []);
  const neutralB = useMemo(() => new THREE.Color('#AFAAA6'), []);

  const particleCount = isMobile ? 1800 : MAX_PARTICLES;

  const { chaoticPositions, clusterPositions, torusPositions, biasedMask, baseColors } = useMemo(() => {
    const chaotic = new Float32Array(particleCount * 3);
    const cluster = new Float32Array(particleCount * 3);
    const torus = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const mask = new Uint8Array(particleCount);

    const clusterCenters = [
      new THREE.Vector3(-2.8, 1.2, -1.8),
      new THREE.Vector3(2.7, -0.8, -2.2),
      new THREE.Vector3(-1.6, -1.5, 2.5),
      new THREE.Vector3(2.1, 1.4, 2.2),
    ];

    for (let i = 0; i < particleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const radius = (isMobile ? 2.7 : 3.3) + (Math.random() - 0.5) * 0.8;

      const sx = radius * Math.sin(phi) * Math.cos(theta);
      const sy = radius * Math.sin(phi) * Math.sin(theta);
      const sz = radius * Math.cos(phi);

      chaotic[i * 3] = sx;
      chaotic[i * 3 + 1] = sy;
      chaotic[i * 3 + 2] = sz;

      const c = clusterCenters[i % clusterCenters.length];
      cluster[i * 3] = c.x + (Math.random() - 0.5) * 1.6;
      cluster[i * 3 + 1] = c.y + (Math.random() - 0.5) * 1.6;
      cluster[i * 3 + 2] = c.z + (Math.random() - 0.5) * 1.6;

      const majorRadius = isMobile ? 2.2 : 2.7;
      const minorRadius = isMobile ? 0.58 : 0.72;
      const a = (i / particleCount) * Math.PI * 2;
      const b = ((i * 1.618) % particleCount) / particleCount * Math.PI * 2;
      const r = majorRadius + minorRadius * Math.cos(b);
      torus[i * 3] = r * Math.cos(a);
      torus[i * 3 + 1] = r * Math.sin(a);
      torus[i * 3 + 2] = minorRadius * Math.sin(b);

      const base = neutralA.clone().lerp(neutralB, Math.random() * 0.55);
      colors[i * 3] = base.r;
      colors[i * 3 + 1] = base.g;
      colors[i * 3 + 2] = base.b;
      mask[i] = Math.random() < 0.3 ? 1 : 0;
    }

    return {
      chaoticPositions: chaotic,
      clusterPositions: cluster,
      torusPositions: torus,
      biasedMask: mask,
      baseColors: colors,
    };
  }, [particleCount, isMobile, neutralA, neutralB]);

  const renderPositions = useMemo(() => new Float32Array(chaoticPositions), [chaoticPositions]);
  const renderColors = useMemo(() => new Float32Array(baseColors), [baseColors]);

  useFrame((state) => {
    const offset = scroll.offset;
    const phase2 = THREE.MathUtils.clamp((offset - 0.3) / 0.3, 0, 1);
    const phase3 = THREE.MathUtils.clamp((offset - 0.6) / 0.4, 0, 1);

    const camX = state.mouse.x * 0.2;
    const camY = state.mouse.y * 0.12;
    const camZ = isMobile ? 8.4 : 9.4;
    const easing = prefersReducedMotion ? 1 : 0.09;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, camX, easing);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, camY, easing);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, camZ, easing);
    camera.lookAt(0, 0, 0);

    if (sceneRef.current) {
      const spin = prefersReducedMotion ? 0 : 0.0018;
      sceneRef.current.rotation.y += spin;
      sceneRef.current.rotation.x = THREE.MathUtils.lerp(sceneRef.current.rotation.x, state.mouse.y * 0.1, 0.06);
    }

    const points = pointsRef.current;
    const positionAttr = positionAttrRef.current;
    const colorAttr = colorAttrRef.current;
    if (points && positionAttr && colorAttr) {
      const positions = positionAttr.array as Float32Array;
      const colors = colorAttr.array as Float32Array;
      const activeCount = Math.min(positionAttr.count, particleCount);
      const time = state.clock.getElapsedTime();

      for (let i = 0; i < activeCount; i++) {
        const idx = i * 3;

        // 1. Chaotic positions with slow drift
        const cx = chaoticPositions[idx] + Math.sin(time * 0.4 + i) * 0.08;
        const cy = chaoticPositions[idx + 1] + Math.cos(time * 0.3 + i) * 0.08;
        const cz = chaoticPositions[idx + 2] + Math.sin(time * 0.5 + i) * 0.08;

        // 2. Fluid Liquid Ribbon
        const pct = i / activeCount;
        const rx = -3.8 + 7.6 * pct;
        const ry = Math.sin(pct * Math.PI * 5 + time * 1.6) * 1.3 + Math.cos(pct * Math.PI * 2.2 + time) * 0.35;
        const rz = Math.cos(pct * Math.PI * 4 + time * 0.9) * 0.65;

        // 3. Double Helix Ring
        const angle = pct * Math.PI * 2 + time * 0.08;
        const twist = pct * Math.PI * 22 + time * 1.5;
        const strand = (i % 2 === 0) ? 1 : -1;
        const R = isMobile ? 2.1 : 2.6;
        const r = isMobile ? 0.24 : 0.32;
        const hx = (R + strand * r * Math.cos(twist)) * Math.cos(angle);
        const hy = (R + strand * r * Math.cos(twist)) * Math.sin(angle);
        const hz = strand * r * Math.sin(twist);

        let x = cx;
        let y = cy;
        let z = cz;

        if (offset >= 0.3 && offset < 0.6) {
          x = THREE.MathUtils.lerp(cx, rx, phase2);
          y = THREE.MathUtils.lerp(cy, ry, phase2);
          z = THREE.MathUtils.lerp(cz, rz, phase2);
        } else if (offset >= 0.6) {
          x = THREE.MathUtils.lerp(rx, hx, phase3);
          y = THREE.MathUtils.lerp(ry, hy, phase3);
          z = THREE.MathUtils.lerp(rz, hz, phase3);
        }

        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        // Determine particle base colors
        tmpColor.setRGB(baseColors[idx], baseColors[idx + 1], baseColors[idx + 2]);

        // Color interpolation based on state
        if (offset >= 0.3 && offset < 0.6) {
          if (biasedMask[i] === 1) {
            // Highly Biased points turn Crimson Oxide
            tmpColor.lerp(warningRed, phase2);
          } else if (i % 4 === 0) {
            // Some points turn Antique Gold
            tmpColor.lerp(trustCopper, phase2);
          } else {
            // The rest turn Sage Green
            tmpColor.lerp(sageGreen, phase2);
          }
        } else if (offset >= 0.6) {
          // Double helix: alternate strands between Sage Green and Antique Gold
          const targetColor = (i % 2 === 0) ? sageGreen : trustCopper;
          // Mix with some crimson oxide to show warning spots in helix that are fading
          const baseStateColor = (biasedMask[i] === 1) ? warningRed : targetColor;
          const finalColor = baseStateColor.clone().lerp(targetColor, phase3);
          tmpColor.copy(finalColor);
        }

        colors[idx] = tmpColor.r;
        colors[idx + 1] = tmpColor.g;
        colors[idx + 2] = tmpColor.b;
      }
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    }
  });

  return (
    <group ref={sceneRef}>
      <ambientLight intensity={0.75} />
      <pointLight position={[6, 5, 8]} intensity={2.2} color="#F1F1F1" />
      <pointLight position={[-7, -5, -7]} intensity={1.3} color="#C89D7C" />

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute ref={positionAttrRef} attach="attributes-position" args={[renderPositions, 3]} />
          <bufferAttribute ref={colorAttrRef} attach="attributes-color" args={[renderColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          transparent
          vertexColors
          size={isMobile ? 0.06 : 0.055}
          sizeAttenuation
          depthWrite={false}
          opacity={0.95}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
