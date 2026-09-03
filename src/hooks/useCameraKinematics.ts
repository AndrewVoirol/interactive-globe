import { useState, useCallback } from 'react';
import * as THREE from 'three';

export function useCameraKinematics() {
  const [cameraTarget, setCameraTarget] = useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const [webgpuCameraPos, setWebgpuCameraPos] = useState<THREE.Vector3 | undefined>(undefined);
  const [targetCameraPos, setTargetCameraPos] = useState<THREE.Vector3 | null>(null);

  const snapCamera = useCallback((view: 'equator' | 'pole' | 'seam' | 'isometric') => {
    let pos = new THREE.Vector3(0, 0, 15);
    if (view === 'equator') {
      pos = new THREE.Vector3(0, 0, 15);
    } else if (view === 'pole') {
      pos = new THREE.Vector3(0, 15, 0.001);
    } else if (view === 'seam') {
      pos = new THREE.Vector3(0, 0, -15);
    } else if (view === 'isometric') {
      pos = new THREE.Vector3(10, 8, 12);
    }
    setTargetCameraPos(pos);
    setWebgpuCameraPos(pos);
    setCameraTarget(new THREE.Vector3(0, 0, 0));
  }, []);

  return {
    cameraTarget, setCameraTarget,
    webgpuCameraPos, setWebgpuCameraPos,
    targetCameraPos, setTargetCameraPos,
    snapCamera,
  };
}

export type CameraKinematicsHook = ReturnType<typeof useCameraKinematics>;
