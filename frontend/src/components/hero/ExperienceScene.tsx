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
  const trustCopper = useMemo(() => new THREE.Color('#D4A373'), []);
  const warningRed = useMemo(() => new THREE.Color('#BC4749'), []);
  const neutralA = useMemo(() => new THREE.Color('#F1F1F1'), []);
  const neutralB = useMemo(() => new THREE.Color('#8E9196'), []);

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

      for (let i = 0; i < activeCount; i++) {
        const idx = i * 3;

        let x = chaoticPositions[idx];
        let y = chaoticPositions[idx + 1];
        let z = chaoticPositions[idx + 2];

        if (offset >= 0.3 && offset < 0.6) {
          x = THREE.MathUtils.lerp(chaoticPositions[idx], clusterPositions[idx], phase2);
          y = THREE.MathUtils.lerp(chaoticPositions[idx + 1], clusterPositions[idx + 1], phase2);
          z = THREE.MathUtils.lerp(chaoticPositions[idx + 2], clusterPositions[idx + 2], phase2);
        } else if (offset >= 0.6) {
          x = THREE.MathUtils.lerp(clusterPositions[idx], torusPositions[idx], phase3);
          y = THREE.MathUtils.lerp(clusterPositions[idx + 1], torusPositions[idx + 1], phase3);
          z = THREE.MathUtils.lerp(clusterPositions[idx + 2], torusPositions[idx + 2], phase3);
        }

        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        tmpColor.setRGB(baseColors[idx], baseColors[idx + 1], baseColors[idx + 2]);
        if (offset >= 0.3 && offset < 0.6) {
          if (biasedMask[i] === 1) {
            tmpColor.lerp(warningRed, phase2);
          } else {
            tmpColor.lerp(neutralB, phase2 * 0.4);
          }
        }
        if (offset >= 0.6) {
          tmpColor.lerp(trustCopper, phase3);
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
      <pointLight position={[-7, -5, -7]} intensity={1.3} color="#D4A373" />

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
