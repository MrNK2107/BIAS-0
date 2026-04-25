import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { ScrollControls, Scroll } from '@react-three/drei';
import { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import ExperienceScene from './ExperienceScene';
import UIOverlay from './UIOverlay';

export default function ScrollExperience() {
  const navigate = useNavigate();
  
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020617' }}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 5], fov: 35 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#020617']} />
        <fog attach="fog" args={['#020617', 5, 25]} />
        
        <Suspense fallback={null}>
          <ScrollControls pages={10} damping={0.15} infinite={false}>
            <ExperienceScene />
            
            <Scroll html style={{ width: '100%' }}>
              <UIOverlay navigate={navigate} />
            </Scroll>
          </ScrollControls>
        </Suspense>
      </Canvas>
    </div>
  );
}
