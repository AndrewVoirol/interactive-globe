import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface KinematicCameraControllerProps {
  targetPos: THREE.Vector3 | null;
  onArrived: () => void;
  controlsRef: React.RefObject<any>;
  onTargetChange: (target: THREE.Vector3) => void;
}

export const KinematicCameraController: React.FC<KinematicCameraControllerProps> = ({
  targetPos,
  onArrived,
  controlsRef,
  onTargetChange,
}) => {
  useFrame(() => {
    if (targetPos && controlsRef.current) {
      const camera = controlsRef.current.object;
      camera.position.lerp(targetPos, 0.08);
      controlsRef.current.target.lerp(new THREE.Vector3(0, 0, 0), 0.08);
      controlsRef.current.update();
      if (camera.position.distanceTo(targetPos) < 0.05) {
        camera.position.copy(targetPos);
        onArrived();
      }
      onTargetChange(controlsRef.current.target.clone());
    }
  });
  return null;
};

export default KinematicCameraController;
