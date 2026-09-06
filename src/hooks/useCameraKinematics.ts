import { useState, useCallback } from 'react';
import { Vec3Tuple } from '../core/math/cameraMath';

export function useCameraKinematics() {
  const [cameraTarget, setCameraTarget] = useState<Vec3Tuple>([0, 0, 0]);
  const [webgpuCameraPos, setWebgpuCameraPos] = useState<Vec3Tuple | undefined>(undefined);
  const [targetCameraPos, setTargetCameraPos] = useState<Vec3Tuple | null>(null);

  const snapCamera = useCallback((view: 'equator' | 'pole' | 'seam' | 'isometric') => {
    let pos: Vec3Tuple = [0, 0, 15];
    if (view === 'equator') {
      pos = [0, 0, 15];
    } else if (view === 'pole') {
      pos = [0, 15, 0.001];
    } else if (view === 'seam') {
      pos = [0, 0, -15];
    } else if (view === 'isometric') {
      pos = [10, 8, 12];
    }
    setTargetCameraPos(pos);
    setWebgpuCameraPos(pos);
    setCameraTarget([0, 0, 0]);
  }, []);

  return {
    cameraTarget, setCameraTarget,
    webgpuCameraPos, setWebgpuCameraPos,
    targetCameraPos, setTargetCameraPos,
    snapCamera,
  };
}

export type CameraKinematicsHook = ReturnType<typeof useCameraKinematics>;
