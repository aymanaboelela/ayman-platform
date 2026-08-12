'use client';

import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';
import * as tokens from '@ayman/ui/tokens';

/** A full-screen triangle. Cheaper than a quad: one primitive, no diagonal seam. */
const VERTEX = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

/**
 * A drifting amber field with a scanline at the 24px pitch of the dot-grid
 * backdrop, faded out radially so it never competes with the hero text.
 * Near-monochrome and low-alpha by construction — this is atmosphere, not decoration.
 */
const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2  uResolution;
  uniform vec3  uAccent;
  uniform float uIntensity;
  varying vec2  vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i),                hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = vUv;
    vec2 p  = uv * vec2(uResolution.x / uResolution.y, 1.0);

    float n = noise(p * 3.0 + vec2(uTime * 0.03, uTime * 0.02));
    n += 0.5 * noise(p * 6.0 - vec2(uTime * 0.02, 0.0));

    // 2*PI/24 — one cycle per 24 device-independent pixels, the same grid pitch
    // the CSS dot-grid uses, so the two layers read as one system.
    float scan  = 0.5 + 0.5 * sin(uv.y * uResolution.y * 0.2617993878);
    float field = smoothstep(0.35, 1.0, n) * (0.85 + 0.15 * scan);

    float vignette = 1.0 - smoothstep(0.15, 0.85, length(uv - vec2(0.5, 0.35)));
    float a = field * vignette * uIntensity;

    // Premultiplied alpha: the renderer is created with premultipliedAlpha:true,
    // so RGB must already be multiplied by A or the edges fringe.
    gl_FragColor = vec4(uAccent * a, a);
  }
`;

/** '#EFA22C' → [0.937, 0.635, 0.173] */
function hexToRgbTriplet(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export default function HeroShader({ frozen }: { frozen: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      // Capping DPR at 1.5 costs nothing visually on a noise field and roughly
      // halves the fragment count on a 3x phone.
      dpr: Math.min(window.devicePixelRatio, 1.5),
    });
    const gl = renderer.gl;
    gl.canvas.style.width = '100%';
    gl.canvas.style.height = '100%';
    gl.canvas.style.display = 'block';
    host.appendChild(gl.canvas);

    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] },
        uAccent: { value: hexToRgbTriplet(tokens.color.accentSolidHex) },
        uIntensity: { value: 0.16 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      renderer.setSize(host.clientWidth, host.clientHeight);
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
      renderer.render({ scene: mesh });
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let raf = 0;
    if (!frozen) {
      const start = performance.now();
      const tick = (now: number) => {
        program.uniforms.uTime.value = (now - start) / 1000;
        renderer.render({ scene: mesh });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      // Without this the context stays alive after navigation and the browser
      // starts evicting the oldest contexts — the canvas silently goes black on
      // the third or fourth visit.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      gl.canvas.remove();
    };
  }, [frozen]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
