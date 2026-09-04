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
      controlsRef.current.target.lerp(new THREE.Vector3(0, 0, 0), 0.08);
      const target = controlsRef.current.target;

      const offset = new THREE.Vector3().subVectors(camera.position, target);
      const curRadius = offset.length();

      if (curRadius > 0.001) {
        const curPhi = Math.acos(Math.min(Math.max(offset.y / curRadius, -1), 1));
        const curTheta = Math.atan2(offset.x, offset.z);

        const targetOffset = new THREE.Vector3().subVectors(targetPos, new THREE.Vector3(0, 0, 0));
        const targetRadius = targetOffset.length();
        const targetPhi = Math.acos(Math.min(Math.max(targetOffset.y / Math.max(targetRadius, 0.001), -1), 1));
        const targetTheta = Math.atan2(targetOffset.x, targetOffset.z);

        // Shortest angular path around azimuth
        let deltaTheta = (targetTheta - curTheta) % (2 * Math.PI);
        if (deltaTheta > Math.PI) deltaTheta -= 2 * Math.PI;
        if (deltaTheta < -Math.PI) deltaTheta += 2 * Math.PI;

        const nextTheta = curTheta + deltaTheta * 0.08;
        const nextPhi = curPhi + (targetPhi - curPhi) * 0.08;
        const nextRadius = curRadius + (targetRadius - curRadius) * 0.08;

        const sinPhi = Math.sin(nextPhi);
        camera.position.set(
          target.x + nextRadius * sinPhi * Math.sin(nextTheta),
          target.y + nextRadius * Math.cos(nextPhi),
          target.z + nextRadius * sinPhi * Math.cos(nextTheta)
        );
      } else {
        camera.position.lerp(targetPos, 0.08);
      }

      controlsRef.current.update();
      if (camera.position.distanceTo(targetPos) < 0.08) {
        camera.position.copy(targetPos);
        onArrived();
      }
      onTargetChange(target.clone());
    }
  });
  return null;
};

export default KinematicCameraController;
