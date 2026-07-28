'use client';

import { Canvas, useFrame } from '@react-three/fiber';
// DEEP IMPORT, not the drei barrel (484kB) — one component, one path, same rule
// the existing Showpiece follows.
import { Float } from '@react-three/drei/core/Float';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';

/**
 * A live neural network in the landing's ink palette: cobalt nodes and edges
 * with a few vermilion "active" nodes, fully connected layer-to-layer, rotating
 * slowly and floating. It reads as "AI, but it's just structure" — on theme for
 * a programming + CS course, and eye-catching without turning neon. Rotation and
 * float are gated by the caller's reduced-motion flag.
 */

const COBALT = '#22d3ee';
const VERMILION = '#a855f7';
const LAYERS = [4, 5, 5, 3];

function buildNet() {
  const nodes: { x: number; y: number; z: number; accent: boolean }[] = [];
  LAYERS.forEach((count, li) => {
    const x = -1.9 + li * 1.27;
    for (let i = 0; i < count; i += 1) {
      const y = (i - (count - 1) / 2) * 0.74;
      const z = (((li + i) % 3) - 1) * 0.34;
      nodes.push({ x, y, z, accent: (li * 3 + i) % 5 === 0 });
    }
  });

  const edges: number[] = [];
  let start = 0;
  for (let li = 0; li < LAYERS.length - 1; li += 1) {
    const layerStart = start;
    const nextStart = start + LAYERS[li]!;
    for (let a = layerStart; a < nextStart; a += 1) {
      for (let b = nextStart; b < nextStart + LAYERS[li + 1]!; b += 1) {
        const na = nodes[a]!;
        const nb = nodes[b]!;
        edges.push(na.x, na.y, na.z, nb.x, nb.y, nb.z);
      }
    }
    start = nextStart;
  }
  return { nodes, positions: new Float32Array(edges) };
}

function Net({ reduced }: { reduced: boolean }) {
  const group = useRef<Group>(null);
  const { nodes, positions } = useMemo(() => buildNet(), []);

  useFrame((_, delta) => {
    if (!group.current || reduced) return;
    // Delta-based so a 120Hz panel does not spin twice as fast.
    group.current.rotation.y += delta * 0.16;
  });

  return (
    <group ref={group} rotation={[0.16, 0.5, 0]}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={COBALT} transparent opacity={0.26} />
      </lineSegments>
      {nodes.map((n, i) => (
        <mesh key={i} position={[n.x, n.y, n.z]}>
          <sphereGeometry args={[n.accent ? 0.1 : 0.068, 18, 18]} />
          <meshBasicMaterial color={n.accent ? VERMILION : COBALT} />
        </mesh>
      ))}
    </group>
  );
}

export default function NeuralScene({ reduced }: { reduced: boolean }) {
  return (
    <Canvas
      aria-hidden="true"
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 5.2], fov: 42 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <Float speed={reduced ? 0 : 1.1} rotationIntensity={reduced ? 0 : 0.2} floatIntensity={reduced ? 0 : 0.45}>
        <Net reduced={reduced} />
      </Float>
    </Canvas>
  );
}
