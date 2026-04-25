import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useScroll, Points, PointMaterial, Stars, Environment, Float } from '@react-three/drei';
import * as THREE from 'three';

const GRID_SIZE = 8; // Smaller grid for mesh stability
const GRID_COUNT = GRID_SIZE * GRID_SIZE;

export default function ExperienceScene() {
  const scroll = useScroll();
  const { viewport } = useThree();
  
  const groupRef = useRef<THREE.Group>(null!);
  const particlesRef = useRef<any>(null!);
  const boxRef = useRef<THREE.Mesh>(null!);
  const stressRef = useRef<THREE.Group>(null!);
  
  // Particles
  const particleCount = 800;
  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, []);

  // Grid Nodes
  const gridNodes = useMemo(() => {
    const nodes = [];
    for (let i = 0; i < GRID_COUNT; i++) {
      nodes.push({
        position: [
          (i % GRID_SIZE - GRID_SIZE / 2) * 1.0,
          (Math.floor(i / GRID_SIZE) - GRID_SIZE / 2) * 1.0,
          0
        ] as [number, number, number],
        isBiased: Math.random() > 0.8
      });
    }
    return nodes;
  }, []);

  useFrame((state) => {
    const offset = scroll.offset;
    const r1 = scroll.range(0, 1/10);
    const r2 = scroll.range(1/10, 1/10);
    const r3 = scroll.range(2/10, 1/10);
    const r4 = scroll.range(3/10, 1/10);
    const r5 = scroll.range(4/10, 1/10);
    const r7 = scroll.range(6/10, 1/10);
    const r10 = scroll.range(9/10, 1/10);
    
    // Camera Logic
    if (offset < 0.2) {
      state.camera.position.z = THREE.MathUtils.lerp(5, 10, r1);
      state.camera.position.y = THREE.MathUtils.lerp(0, 2, r2);
    } else if (offset < 0.4) {
      state.camera.position.z = THREE.MathUtils.lerp(10, 15, r3);
      state.camera.position.x = THREE.MathUtils.lerp(0, 5, r3);
    } else if (offset < 0.8) {
      state.camera.position.z = THREE.MathUtils.lerp(15, 8, r4);
      state.camera.position.x = THREE.MathUtils.lerp(5, -5, r7);
    } else {
      state.camera.position.z = THREE.MathUtils.lerp(8, 5, r10);
      state.camera.position.x = THREE.MathUtils.lerp(-5, 0, r10);
    }
    state.camera.lookAt(0, 0, 0);
    
    if (groupRef.current) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, state.mouse.x * 0.1, 0.1);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -state.mouse.y * 0.1, 0.1);
    }
    
    if (particlesRef.current) {
      particlesRef.current.rotation.y += 0.001;
      particlesRef.current.visible = offset < 0.15 || offset > 0.85;
    }

    if (boxRef.current) {
      boxRef.current.rotation.y += 0.01;
      boxRef.current.rotation.x += 0.005;
    }

    if (stressRef.current && offset > 0.6 && offset < 0.8) {
      stressRef.current.position.x = (Math.random() - 0.5) * 0.2;
      stressRef.current.position.y = (Math.random() - 0.5) * 0.2;
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1.5} color="#2dd4bf" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#818cf8" />
      
      {/* 1. PARTICLES */}
      <Points ref={particlesRef} positions={positions} stride={3}>
        <PointMaterial transparent color="#2dd4bf" size={0.06} sizeAttenuation={true} depthWrite={false} blending={THREE.AdditiveBlending} />
      </Points>

      {/* 2. GRID */}
      <group visible={scroll.offset > 0.1 && scroll.offset < 0.3}>
        {gridNodes.map((node, i) => (
          <mesh key={i} position={node.position}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color={node.isBiased && scroll.offset > 0.15 ? "#f43f5e" : "#334155"} />
          </mesh>
        ))}
      </group>

      {/* 3. PANELS */}
      <group visible={scroll.offset > 0.2 && scroll.offset < 0.45}>
        <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
          <mesh position={[3, 2, 2]}>
            <boxGeometry args={[4, 2.5, 0.1]} />
            <meshStandardMaterial color="#2dd4bf" transparent opacity={0.3} metalness={0.8} />
          </mesh>
        </Float>
      </group>

      {/* 4. MODEL CUBE */}
      <group visible={scroll.offset > 0.35 && scroll.offset < 0.55}>
        <mesh ref={boxRef}>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color="#0f172a" transparent opacity={0.6} metalness={1} roughness={0.1} />
        </mesh>
      </group>

      {/* 5. BARS */}
      <group visible={scroll.offset > 0.45 && scroll.offset < 0.65}>
        {Array.from({ length: 4 }).map((_, i) => (
          <mesh key={i} position={[-3, (i - 1.5) * 1.2, 0]}>
            <boxGeometry args={[3, 0.6, 0.2]} />
            <meshStandardMaterial color={i === 1 ? "#f43f5e" : "#2dd4bf"} />
          </mesh>
        ))}
      </group>

      {/* 7. STRESS TEST */}
      <group ref={stressRef} visible={scroll.offset > 0.6 && scroll.offset < 0.8}>
        <mesh>
          <sphereGeometry args={[1.5, 32, 32]} />
          <meshStandardMaterial color={scroll.offset > 0.7 ? "#10b981" : "#f43f5e"} wireframe />
        </mesh>
      </group>

      {/* 8. MITIGATION GRID */}
      <group visible={scroll.offset > 0.75 && scroll.offset < 0.9}>
        {gridNodes.map((node, i) => (
          <mesh key={i} position={[node.position[0], node.position[1], -2]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color={node.isBiased ? "#10b981" : "#334155"} />
          </mesh>
        ))}
      </group>

      <Stars radius={100} depth={50} count={1000} factor={4} saturation={0} fade speed={1} />
      <Environment preset="city" />
    </group>
  );
}
