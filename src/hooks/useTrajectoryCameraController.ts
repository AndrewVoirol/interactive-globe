// ============================================================================
// File: src/hooks/useTrajectoryCameraController.ts
// Architecture: React Hook for Trajectory Camera Controller
// Description: Connects TrajectoryCameraController to React component tree and WebGPU render loop
// ============================================================================

import { useRef, useState, useCallback, useEffect } from 'react';
import { TrajectoryCameraController, Waypoint3D } from '../core/camera/TrajectoryCameraController';
import { HAWAII_WAYPOINTS, CAPE_COD_WAYPOINTS } from '../core/camera/litmusWaypoints';
import { Vector3 } from '../core/math/cameraMath';

export type LitmusSequenceName = 'hawaii' | 'cape-cod';

export interface UseTrajectoryCameraControllerOptions {
  initialSequence?: LitmusSequenceName;
  duration?: number; // seconds per sequence, 5-10s (default 8.0s)
  loop?: boolean;
  onSequenceComplete?: (sequence: LitmusSequenceName) => void;
}

export interface TrajectoryFrameOutput {
  isDemoActive: boolean;
  position: Vector3;
  target: Vector3;
  fov: number;
  progress: number;
  rtcMatrices: ReturnType<TrajectoryCameraController['getRtcMatrices']>;
}

export function useTrajectoryCameraController(options: UseTrajectoryCameraControllerOptions = {}) {
  const {
    initialSequence = 'hawaii',
    duration = 8.0,
    loop = false,
    onSequenceComplete,
  } = options;

  const controllerRef = useRef<TrajectoryCameraController>(new TrajectoryCameraController());
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [activeSequence, setActiveSequence] = useState<LitmusSequenceName>(initialSequence);
  const [progress, setProgress] = useState<number>(0);

  const isDemoModeRef = useRef<boolean>(false);
  isDemoModeRef.current = isDemoMode;

  const activeSequenceRef = useRef<LitmusSequenceName>(activeSequence);
  activeSequenceRef.current = activeSequence;

  const durationRef = useRef<number>(duration);
  durationRef.current = duration;

  const loopRef = useRef<boolean>(loop);
  loopRef.current = loop;

  const onSequenceCompleteRef = useRef(onSequenceComplete);
  onSequenceCompleteRef.current = onSequenceComplete;

  // Helper to load waypoints for a given sequence
  const loadSequenceWaypoints = useCallback((seq: LitmusSequenceName, seqDuration = durationRef.current) => {
    const controller = controllerRef.current;
    controller.setMode('dolly-cinematic');
    const waypoints: Waypoint3D[] = seq === 'cape-cod' ? CAPE_COD_WAYPOINTS : HAWAII_WAYPOINTS;
    controller.setWaypoints(waypoints, seqDuration, loopRef.current);
    controller.setProgress(0);
    setProgress(0);
  }, []);

  const startDemo = useCallback((sequence?: LitmusSequenceName, customDuration?: number) => {
    const seq = sequence ?? activeSequenceRef.current;
    const dur = customDuration ?? durationRef.current;
    setActiveSequence(seq);
    loadSequenceWaypoints(seq, dur);
    setIsDemoMode(true);
    isDemoModeRef.current = true;
  }, [loadSequenceWaypoints]);

  const stopDemo = useCallback(() => {
    setIsDemoMode(false);
    isDemoModeRef.current = false;
    controllerRef.current.setIsPlaying(false);
  }, []);

  const toggleDemo = useCallback((sequence?: LitmusSequenceName) => {
    if (isDemoModeRef.current) {
      stopDemo();
    } else {
      startDemo(sequence);
    }
  }, [startDemo, stopDemo]);

  const setSequence = useCallback((sequence: LitmusSequenceName) => {
    setActiveSequence(sequence);
    activeSequenceRef.current = sequence;
    loadSequenceWaypoints(sequence);
  }, [loadSequenceWaypoints]);

  /**
   * Called per frame inside the render loop with frame delta dt (seconds).
   * When demo mode is active, steps kinematics and outputs overriding camera parameters.
   */
  const updateFrame = useCallback((dt: number): TrajectoryFrameOutput => {
    const controller = controllerRef.current;
    const active = isDemoModeRef.current;

    if (active) {
      controller.update(dt);
      const curProgress = controller.getProgress();

      // Check for sequence completion
      if (controller.isFinished() && !loopRef.current) {
        setIsDemoMode(false);
        isDemoModeRef.current = false;
        onSequenceCompleteRef.current?.(activeSequenceRef.current);
      }

      return {
        isDemoActive: true,
        position: controller.position,
        target: controller.target,
        fov: controller.getFov(),
        progress: curProgress,
        rtcMatrices: controller.getRtcMatrices(),
      };
    }

    return {
      isDemoActive: false,
      position: controller.position,
      target: controller.target,
      fov: controller.getFov(),
      progress: controller.getProgress(),
      rtcMatrices: controller.getRtcMatrices(),
    };
  }, []);

  // Expose DevTools window hook for automated capture and inspection
  useEffect(() => {
    (window as any).__INDICATRIX_TRAJECTORY__ = {
      startDemo,
      stopDemo,
      toggleDemo,
      setSequence,
      isDemoActive: () => isDemoModeRef.current,
      getSequence: () => activeSequenceRef.current,
      getProgress: () => controllerRef.current.getProgress(),
      setProgress: (p: number) => {
        controllerRef.current.setProgress(p);
        setProgress(p);
      },
      getController: () => controllerRef.current,
      getWaypoints: (seq: LitmusSequenceName) =>
        seq === 'cape-cod' ? CAPE_COD_WAYPOINTS : HAWAII_WAYPOINTS,
    };

    return () => {
      delete (window as any).__INDICATRIX_TRAJECTORY__;
    };
  }, [startDemo, stopDemo, toggleDemo, setSequence]);

  return {
    controller: controllerRef.current,
    isDemoMode,
    activeSequence,
    progress,
    startDemo,
    stopDemo,
    toggleDemo,
    setSequence,
    updateFrame,
  };
}

export default useTrajectoryCameraController;
