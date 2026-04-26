import { Canvas } from '@react-three/fiber';
import { ScrollControls, Scroll } from '@react-three/drei';
import { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import ExperienceScene from './ExperienceScene';
import UIOverlay from './UIOverlay';

export default function ScrollExperience() {
  const navigate = useNavigate();
  
  return (
    <div className="hero-viewport">
      <Canvas
        shadows
        camera={{ position: [0, 0, 5], fov: 35 }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#0F1115']} />
        <fog attach="fog" args={['#0F1115', 5, 25]} />
        
        <Suspense fallback={null}>
          <ScrollControls pages={5} damping={0.18} infinite={false}>
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
