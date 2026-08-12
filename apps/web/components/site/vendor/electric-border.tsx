/* eslint-disable */
// @ts-nocheck -- vendored third-party source; see README.md
'use client';

import React, { useEffect, useRef, useCallback, CSSProperties, ReactNode } from 'react';
import './electric-border.css';

interface ElectricBorderProps {
  children?: ReactNode;
  color?: string;
  speed?: number;
  chaos?: number;
  borderRadius?: number;
  className?: string;
  style?: CSSProperties;
}

const ElectricBorder: React.FC<ElectricBorderProps> = ({
  children,
  color = '#5227FF',
  speed = 1,
  chaos = 0.12,
  borderRadius = 24,
  className,
  style
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  const random = useCallback((x: number): number => {
    return (Math.sin(x * 12.9898) * 43758.5453) % 1;
  }, []);

  const noise2D = useCallback(
    (x: number, y: number): number => {
      const i = Math.floor(x);
      const j = Math.floor(y);
      const fx = x - i;
      const fy = y - j;

      const a = random(i + j * 57);
      const b = random(i + 1 + j * 57);
      const c = random(i + (j + 1) * 57);
      const d = random(i + 1 + (j + 1) * 57);

      const ux = fx * fx * (3.0 - 2.0 * fx);
      const uy = fy * fy * (3.0 - 2.0 * fy);

      return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
    },
    [random]
  );

  const octavedNoise = useCallback(
    (
      x: number,
      octaves: number,
      lacunarity: number,
      gain: number,
      baseAmplitude: number,
      baseFrequency: number,
      time: number,
      seed: number,
      baseFlatness: number
    ): number => {
      let y = 0;
      let amplitude = baseAmplitude;
      let frequency = baseFrequency;

      for (let i = 0; i < octaves; i++) {
        let octaveAmplitude = amplitude;
        if (i === 0) {
          octaveAmplitude *= baseFlatness;
        }
        y += octaveAmplitude * noise2D(frequency * x + seed * 100, time * frequency * 0.3);
        frequency *= lacunarity;
        amplitude *= gain;
      }

      return y;
    },
    [noise2D]
  );

  const getCornerPoint = useCallback(
    (
      centerX: number,
      centerY: number,
      radius: number,
      startAngle: number,
      arcLength: number,
      progress: number
    ): { x: number; y: number } => {
      const angle = startAngle + progress * arcLength;
      return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    },
    []
  );

  const getRoundedRectPoint = useCallback(
    (t: number, left: number, top: number, width: number, height: number, radius: number): { x: number; y: number } => {
      const straightWidth = width - 2 * radius;
      const straightHeight = height - 2 * radius;
      const cornerArc = (Math.PI * radius) / 2;
      const totalPerimeter = 2 * straightWidth + 2 * straightHeight + 4 * cornerArc;
      const distance = t * totalPerimeter;

      let accumulated = 0;

      if (distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth;
        return { x: left + radius + progress * straightWidth, y: top };
      }
      accumulated += straightWidth;

      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + width - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      if (distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight;
        return { x: left + width, y: top + radius + progress * straightHeight };
      }
      accumulated += straightHeight;

      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + width - radius, top + height - radius, radius, 0, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      if (distance <= accumulated + straightWidth) {
        const progress = (distance - accumulated) / straightWidth;
        return { x: left + width - radius - progress * straightWidth, y: top + height };
      }
      accumulated += straightWidth;

      if (distance <= accumulated + cornerArc) {
        const progress = (distance - accumulated) / cornerArc;
        return getCornerPoint(left + radius, top + height - radius, radius, Math.PI / 2, Math.PI / 2, progress);
      }
      accumulated += cornerArc;

      if (distance <= accumulated + straightHeight) {
        const progress = (distance - accumulated) / straightHeight;
        return { x: left, y: top + height - radius - progress * straightHeight };
      }
      accumulated += straightHeight;

      const progress = (distance - accumulated) / cornerArc;
      return getCornerPoint(left + radius, top + radius, radius, Math.PI, Math.PI / 2, progress);
    },
    [getCornerPoint]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /**
     * ⚠️ ADAPTED: 7 octaves, not upstream's 10, and the three that went are
     * ones no screen could ever have shown.
     *
     * Octave `i` displaces a point by at most `chaos * gain**i * displacement`.
     * At this file's `gain` of 0.7 and `displacement` of 60, the busiest card on
     * the site (`chaos: 0.16`) gets 0.79px from octave 7, 0.55 from 8 and 0.39
     * from 9 — sub-pixel, on a 1px stroke. They are also far past Nyquist for
     * the sampling below: octave 9 runs at `frequency * lacunarity**9` ≈ 687,
     * which over the `progress * 8` domain is some 5500 cycles around a ~2000px
     * perimeter. The loop cannot resolve them, so what they actually contribute
     * is aliasing noise at 30% of the whole effect's cost.
     */
    const octaves = 7;
    const lacunarity = 1.6;
    const gain = 0.7;
    const amplitude = chaos;
    const frequency = 10;
    const baseFlatness = 0;
    const displacement = 60;
    const borderOffset = 60;

    const updateSize = () => {
      // ⚠️ LAYOUT size, not `getBoundingClientRect()`. A rect includes every
      // transform on every ancestor, and these cards are entrance-animated from
      // `scale: 0.24` — so measuring a rect caught them at a quarter size and
      // drew a filament a quarter of the card scribbled across its middle,
      // which then never corrected: `ResizeObserver` watches the layout box and
      // does not fire when a transform changes.
      //
      // `offsetWidth`/`offsetHeight` are the untransformed box. The canvas is
      // sized in CSS pixels and any ancestor scale carries it along for free.
      const width = container.offsetWidth + borderOffset * 2;
      const height = container.offsetHeight + borderOffset * 2;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      return { width, height };
    };

    let { width, height } = updateSize();
    let lastDpr = Math.min(window.devicePixelRatio || 1, 2);

    /* ---- ADAPTED FOR THIS REPO: when this draws, and how often -------------
     *
     * Upstream redraws every animation frame, forever, from the moment it
     * mounts. Both halves of that are load-bearing costs here, because this
     * component is not used once — the landing page carries SIX of these at a
     * time (three year cards, three course cards), and each redraw walks ~1000
     * points around the card's perimeter calling `octavedNoise` twice per
     * point, ten octaves deep. That is ~120k noise evaluations per frame.
     *
     * Measured at 1512x945 with a 4x CPU slowdown — an ordinary student laptop:
     * the whole page ran at 15fps with these drawing and 30fps without, and the
     * dragon clip on `#years` presented 14.6 of the 22.5 frames per second it
     * should, dropping 39 frames with a 167ms worst gap. A 167ms hold on one
     * frame is not judder, it is a photograph, and it was reported as one.
     *
     * Neither change below is visible. The filament is a slow shimmer.
     */

    /** Draw only while the card is near the viewport. */
    let onScreen = false;
    /**
     * ⚠️ 30fps, and the motion does NOT slow down with it.
     *
     * `timeRef` advances by REAL elapsed seconds, so halving the redraw rate
     * halves the cost and leaves the animation running at exactly the speed it
     * did before — it simply lands on half as many intermediate positions,
     * which at `speed` 0.5–0.7 is not something an eye can resolve.
     */
    const FRAME_MS = 1000 / 30;
    let lastDraw = 0;

    const drawElectricBorder = (currentTime: number) => {
      if (!canvas || !ctx) return;

      // Scheduled first so a skipped frame still keeps the loop alive.
      animationRef.current = requestAnimationFrame(drawElectricBorder);
      if (currentTime - lastDraw < FRAME_MS) return;
      lastDraw = currentTime;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (dpr !== lastDpr) {
        lastDpr = dpr;
        const newSize = updateSize();
        width = newSize.width;
        height = newSize.height;
      }

      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
      timeRef.current += deltaTime * speed;
      lastFrameTimeRef.current = currentTime;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const scale = displacement;
      const left = borderOffset;
      const top = borderOffset;
      const borderWidth = width - 2 * borderOffset;
      const borderHeight = height - 2 * borderOffset;
      const maxRadius = Math.min(borderWidth, borderHeight) / 2;
      const radius = Math.min(borderRadius, maxRadius);

      const approximatePerimeter = 2 * (borderWidth + borderHeight) + 2 * Math.PI * radius;
      // ⚠️ ADAPTED: a point every 3px rather than upstream's 2. The base wave is
      // `frequency` 10 over a `progress * 8` domain — 80 cycles around the
      // perimeter, so ~25px per cycle — and 3px spacing still puts eight
      // samples on each one. The line is stroked with round joins over a 1px
      // pen, so the third of the points that went were being drawn on top of
      // their neighbours.
      const sampleCount = Math.floor(approximatePerimeter / 3);

      ctx.beginPath();

      for (let i = 0; i <= sampleCount; i++) {
        const progress = i / sampleCount;

        const point = getRoundedRectPoint(progress, left, top, borderWidth, borderHeight, radius);

        const xNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          0,
          baseFlatness
        );
        const yNoise = octavedNoise(
          progress * 8,
          octaves,
          lacunarity,
          gain,
          amplitude,
          frequency,
          timeRef.current,
          1,
          baseFlatness
        );

        const displacedX = point.x + xNoise * scale;
        const displacedY = point.y + yNoise * scale;

        if (i === 0) {
          ctx.moveTo(displacedX, displacedY);
        } else {
          ctx.lineTo(displacedX, displacedY);
        }
      }

      ctx.closePath();
      ctx.stroke();
    };

    /**
     * ⚠️ `lastFrameTimeRef` IS RESET ON EVERY START, and skipping that shows.
     *
     * The loop advances `timeRef` by the gap since the last frame it drew. Left
     * alone across a stop, that gap becomes however long the card spent off
     * screen or the tab spent in the background — so the border would come back
     * having silently fast-forwarded minutes of noise, which lands as a visible
     * snap on the first frame the reader sees. This is also a latent upstream
     * bug on tab-switch, where rAF stops on its own.
     */
    const start = () => {
      if (animationRef.current !== null) return;
      lastFrameTimeRef.current = performance.now();
      lastDraw = 0;
      animationRef.current = requestAnimationFrame(drawElectricBorder);
    };

    const stop = () => {
      if (animationRef.current === null) return;
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };

    const sync = () => (onScreen && !document.hidden ? start() : stop());

    const resizeObserver = new ResizeObserver(() => {
      const newSize = updateSize();
      width = newSize.width;
      height = newSize.height;
    });
    resizeObserver.observe(container);

    // Half a viewport of margin: the border is already drawing well before it
    // can be seen, so a reader never catches one starting up.
    const visibility = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        sync();
      },
      { rootMargin: '50% 0px' }
    );
    visibility.observe(container);

    document.addEventListener('visibilitychange', sync);

    return () => {
      stop();
      resizeObserver.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [color, speed, chaos, borderRadius, octavedNoise, getRoundedRectPoint]);

  const vars = {
    '--electric-border-color': color,
    borderRadius
  } as CSSProperties;

  return (
    <div ref={containerRef} className={`electric-border ${className ?? ''}`} style={{ ...vars, ...style }}>
      <div className="eb-canvas-container">
        <canvas ref={canvasRef} className="eb-canvas" />
      </div>
      <div className="eb-layers">
        <div className="eb-glow-1" />
        <div className="eb-glow-2" />
        <div className="eb-background-glow" />
      </div>
      <div className="eb-content">{children}</div>
    </div>
  );
};

export default ElectricBorder;
