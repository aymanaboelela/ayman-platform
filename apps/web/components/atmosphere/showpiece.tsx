'use client';

import { Canvas, useFrame } from '@react-three/fiber';
// DEEP IMPORT, NOT THE BARREL. `@react-three/drei` re-exports everything from
// its index — 484kB gzip — and tree-shaking does not reliably remove the rest
// because several of its modules have side effects. One component, one path.
import { Float } from '@react-three/drei/core/Float';
import { useRef } from 'react';
import type { Mesh } from 'three';
import * as tokens from '@ayman/ui/tokens';
import { useRampHex } from '@/lib/ramp-color';

function Polyhedron() {
  const ref = useRef<Mesh>(null);
  /* The HOOK, not `rampHex`: this colour ends up in prerendered markup, and a
     value the server computes as the amber literal and the client computes as
     the tenant's is exactly the pair React mismatches on while hydrating. */
  const accent = useRampHex(500, tokens.color.accentSolidHex);

  useFrame((_, delta) => {
    if (!ref.current) return;
    // Delta-based, not frame-based: a 120Hz display must not spin twice as fast.
    ref.current.rotation.y += delta * 0.25;
    ref.current.rotation.x += delta * 0.08;
  });

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1.15, 1]} />
      {/* Wireframe over the near-black base reads as an engineering instrument.
          `meshBasicMaterial` needs no lights, which removes an entire render pass. */}
      <meshBasicMaterial color={accent} wireframe />
    </mesh>
  );
}

export default function Showpiece() {
  return (
    <Canvas
      // The canvas is decorative; it is inside an aria-hidden wrapper.
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 4], fov: 45 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.4}>
        <Polyhedron />
      </Float>
    </Canvas>
  );
}
