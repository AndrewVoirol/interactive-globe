// ============================================================================
// File: src/webgpu/WebGPUCanvas.tsx
// Component: Dedicated WebGPU React Canvas Wrapper with Orbit & Telemetry
// Description: Autonomous 1M-node WebGPU viewport with smooth touch/mouse control
// ============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { WebGPUEngine } from './WebGPUEngine';
import { CursorTracker } from '../utils/raycast';
import { generateDymaxionBuffer } from '../utils/dymaxion';

export interface WebGPUCanvasProps {
  unfurlProgress: number;
  mode: 0 | 1 | 2 | 3 | 4;
  layerMode: 0 | 1 | 2;
  resolution: '100k' | '1M';
  cameraTarget?: THREE.Vector3;
  cameraPosition?: THREE.Vector3;
  onFpsUpdate?: (fps: number) => void;
  onDataLoaded?: (info: {
    pointCount: number;
    lineCount: number;
    format: string;
    loadTimeMs: number;
    vramMb: number;
  }) => void;
  onError?: (error: Error) => void;
}

export const WebGPUCanvas: React.FC<WebGPUCanvasProps> = ({
  unfurlProgress,
  mode,
  layerMode,
  resolution,
  cameraTarget,
  cameraPosition,
  onFpsUpdate,
  onDataLoaded,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WebGPUEngine>(new WebGPUEngine());
  const cursorTrackerRef = useRef<CursorTracker>(new CursorTracker());
  const animFrameRef = useRef<number>(0);

  // Camera & Orbit State
  const cameraRef = useRef<THREE.PerspectiveCamera>(
    new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  );
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const sphericalRef = useRef<{ radius: number; theta: number; phi: number }>({
    radius: 15,
    theta: 0,
    phi: Math.PI / 2,
  });

  const isDraggingRef = useRef(false);
  const dragButtonRef = useRef(0);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // FPS Telemetry
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const startTimeRef = useRef(performance.now());
  const lastFrameTimeRef = useRef(performance.now());

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Update camera target or position when props change
  useEffect(() => {
    if (cameraTarget) {
      targetRef.current.copy(cameraTarget);
    }
  }, [cameraTarget]);

  useEffect(() => {
    if (cameraPosition) {
      const cam = cameraRef.current;
      cam.position.copy(cameraPosition);
      const offset = new THREE.Vector3().subVectors(cam.position, targetRef.current);
      sphericalRef.current.radius = offset.length();
      sphericalRef.current.theta = Math.atan2(offset.x, offset.z);
      sphericalRef.current.phi = Math.acos(Math.min(Math.max(offset.y / sphericalRef.current.radius, -1), 1));
    }
  }, [cameraPosition]);

  // Update Camera Matrix from Spherical Coordinates
  const updateCameraTransform = useCallback(() => {
    const cam = cameraRef.current;
    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;

    const sinPhi = Math.sin(phi);
    const x = target.x + radius * sinPhi * Math.sin(theta);
    const y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * sinPhi * Math.cos(theta);

    cam.position.set(x, y, z);
    cam.lookAt(target);
    cam.updateMatrixWorld();
  }, []);

  // Initialize Camera position
  useEffect(() => {
    cameraRef.current.position.set(0, 0, 15);
    updateCameraTransform();
  }, [updateCameraTransform]);

  // Attach Window-Level Cursor Tracker
  useEffect(() => {
    const tracker = cursorTrackerRef.current;
    tracker.attach(window);
    return () => {
      tracker.detach();
    };
  }, []);

  // Pointer & Drag Controls for WebGPU Viewport
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      isDraggingRef.current = true;
      dragButtonRef.current = e.button;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      if (dragButtonRef.current === 0) {
        // Orbit rotation
        sphericalRef.current.theta -= dx * 0.005;
        sphericalRef.current.phi = Math.min(
          Math.max(sphericalRef.current.phi - dy * 0.005, 0.01),
          Math.PI - 0.01
        );
      } else if (dragButtonRef.current === 2 || e.shiftKey) {
        // Pan
        const cam = cameraRef.current;
        const panSpeed = sphericalRef.current.radius * 0.001;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        targetRef.current.addScaledVector(right, -dx * panSpeed);
        targetRef.current.addScaledVector(up, dy * panSpeed);
      }
      updateCameraTransform();
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1 + e.deltaY * 0.001;
      sphericalRef.current.radius = Math.min(Math.max(sphericalRef.current.radius * zoomFactor, 6.0), 50.0);
      updateCameraTransform();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [updateCameraTransform]);

  // Load Geometry and Initialize WebGPU Engine
  useEffect(() => {
    let isMounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsLoading(true);
    setLoadError(null);

    const t0 = performance.now();
    const binFile = resolution === '1M' ? '/geo-mesh-1m.bin' : '/geo-mesh-100k.bin';
    const jsonFile = resolution === '1M' ? null : '/geo-mesh-100k.json';

    fetch(binFile)
      .then(async (res) => {
        if (!res.ok) throw new Error(`BIN fetch failed (${res.status})`);
        const buffer = await res.arrayBuffer();
        if (!isMounted) return;

        const view = new DataView(buffer);
        const magic = view.getUint32(0, true);
        if (magic !== 0x47454F4D) throw new Error('Invalid binary magic header');

        const pointCount = view.getUint32(8, true);
        const indexCount = view.getUint32(12, true);
        const pOffset = view.getUint32(16, true);
        const tOffset = view.getUint32(20, true);
        const typOffset = view.getUint32(24, true);
        const iOffset = view.getUint32(28, true);

        const pointsData = new Float32Array(buffer, pOffset, pointCount * 3);
        const target2DData = new Float32Array(buffer, tOffset, pointCount * 2);
        const typeData = new Float32Array(buffer, typOffset, pointCount);
        const lineIndices = new Uint32Array(buffer, iOffset, indexCount);
        const dymaxion2DData = generateDymaxionBuffer(pointsData);

        const engine = engineRef.current;
        await engine.initialize({
          canvas,
          pointCount,
          pointsData,
          target2DData,
          typeData,
          dymaxion2DData,
          lineIndices,
        });

        if (!isMounted) return;
        setIsLoading(false);

        const t1 = performance.now();
        const vramBytes = pointsData.byteLength + target2DData.byteLength + dymaxion2DData.byteLength + typeData.byteLength + lineIndices.byteLength;

        onDataLoaded?.({
          pointCount,
          lineCount: indexCount / 2,
          format: 'WebGPU (Zero-Copy 120 FPS)',
          loadTimeMs: Math.round(t1 - t0),
          vramMb: parseFloat((vramBytes / (1024 * 1024)).toFixed(2)),
        });
      })
      .catch(async (binErr) => {
        if (!jsonFile) {
          console.error('WebGPU binary load failed:', binErr);
          if (isMounted) {
            setLoadError(binErr.message);
            onError?.(binErr);
          }
          return;
        }

        try {
          const res = await fetch(jsonFile);
          const data = await res.json();
          if (!isMounted) return;

          const pointsData = new Float32Array(data.pointsBuffer);
          const target2DData = new Float32Array(data.target2DBuffer);
          const typeData = new Float32Array(data.typeBuffer);
          const lineIndices = new Uint32Array(data.lineIndices);
          const dymaxion2DData = generateDymaxionBuffer(pointsData);

          const engine = engineRef.current;
          await engine.initialize({
            canvas,
            pointCount: pointsData.length / 3,
            pointsData,
            target2DData,
            typeData,
            dymaxion2DData,
            lineIndices,
          });

          if (!isMounted) return;
          setIsLoading(false);

          const t1 = performance.now();
          const vramBytes = pointsData.byteLength + target2DData.byteLength + dymaxion2DData.byteLength + typeData.byteLength + lineIndices.byteLength;

          onDataLoaded?.({
            pointCount: pointsData.length / 3,
            lineCount: lineIndices.length / 2,
            format: 'WebGPU (JSON Fallback)',
            loadTimeMs: Math.round(t1 - t0),
            vramMb: parseFloat((vramBytes / (1024 * 1024)).toFixed(2)),
          });
        } catch (err: any) {
          if (isMounted) {
            setLoadError(err.message);
            onError?.(err);
          }
        }
      });

    return () => {
      isMounted = false;
      engineRef.current.dispose();
    };
  }, [resolution, onDataLoaded, onError]);

  // Resize Handling
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      cameraRef.current.aspect = width / Math.max(height, 1);
      cameraRef.current.updateProjectionMatrix();

      engineRef.current.resize(canvas.width, canvas.height);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // WebGPU Continuous Simulation & Render Loop
  useEffect(() => {
    let isActive = true;

    const renderLoop = (now: number) => {
      if (!isActive) return;

      const engine = engineRef.current;
      const camera = cameraRef.current;
      const tracker = cursorTrackerRef.current;

      if (engine.initialized) {
        const time = (now - startTimeRef.current) / 1000;
        const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
        lastFrameTimeRef.current = now;

        // Auto-rotation when alpha near zero and not dragging
        if (unfurlProgress < 0.01 && !isDraggingRef.current) {
          sphericalRef.current.theta += 0.003;
          updateCameraTransform();
        }

        // Analytical Manifold Cursor Raycast via CursorTracker
        const cursorUniforms = tracker.update(camera, unfurlProgress);

        engine.render({
          unfurl: unfurlProgress,
          mode,
          layerMode,
          time,
          dt,
          cursorRayOrig: cursorUniforms.u_cursorRayOrig,
          cursorRayDir: cursorUniforms.u_cursorRayDir,
          cursorHitPos: cursorUniforms.u_cursorHitPos,
          cursorVel: cursorUniforms.u_cursorVel,
          cursorActive: cursorUniforms.u_cursorActive > 0.001,
          camera,
        });

        // Frame Telemetry Calculation
        frameCountRef.current++;
        if (now - lastFpsTimeRef.current >= 500) {
          const fps = Math.round((frameCountRef.current * 1000) / (now - lastFpsTimeRef.current));
          onFpsUpdate?.(fps);
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isActive = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [unfurlProgress, mode, layerMode, onFpsUpdate, updateCameraTransform]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#020408]">
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2 text-sky-400 font-mono text-xs">
            <span className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></span>
            <span>Allocating WebGPU 1M Matrix Storage...</span>
          </div>
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="p-4 rounded-xl border border-rose-500/50 bg-rose-950/40 text-rose-300 font-mono text-xs max-w-md">
            <p className="font-bold mb-1">WebGPU Initialization Error</p>
            <p>{loadError}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebGPUCanvas;
