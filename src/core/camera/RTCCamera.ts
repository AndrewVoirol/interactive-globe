// ============================================================================
// File: src/core/camera/RTCCamera.ts
// Architecture: Dual FP32 Relative-To-Center (RTC) Precision & Logarithmic Depth Engine
// Description: Eliminates single-precision mantissa jitter from orbit (400km) to ground (0m)
// ============================================================================

import { Vector3, Matrix4, PerspectiveCamera, IVector3 } from '../math/cameraMath';

export type AltitudeRegime = 'leo-space' | 'commercial' | 'ground-level';

export interface AltitudeConfig {
  regime: AltitudeRegime;
  logDepthC: number;
  nearPlane: number;
  farPlane: number;
}

export class RTCCamera {
  public cameraPosition: Vector3 = new Vector3(0, 0, 15);
  public cameraTarget: Vector3 = new Vector3(0, 0, 0);
  public upVector: Vector3 = new Vector3(0, 1, 0);

  private globeRadius: number = 5.0;

  /**
   * Determine altitude regime and logarithmic depth constants
   */
  public getAltitudeRegime(): AltitudeConfig {
    const distFromCenter = this.cameraPosition.length();
    const altitude = distFromCenter - this.globeRadius;

    if (altitude > 0.3) {
      // > 300km altitude (LEO Space)
      return { regime: 'leo-space', logDepthC: 1.0, nearPlane: 0.1, farPlane: 100.0 };
    } else if (altitude > 0.005) {
      // 5km to 300km (Commercial Aviation)
      return { regime: 'commercial', logDepthC: 0.01, nearPlane: 0.001, farPlane: 10.0 };
    } else {
      // Ground Level (<5km)
      return { regime: 'ground-level', logDepthC: 0.0001, nearPlane: 0.0001, farPlane: 2.0 };
    }
  }

  /**
   * Relative-to-Center (RTC) transformation for world vertex pWorld
   * p_rtc = p_world - p_cam
   */
  public computeRTCVector(pWorld: IVector3 | Vector3): Vector3 {
    return new Vector3(pWorld.x, pWorld.y, pWorld.z).sub(this.cameraPosition);
  }

  /**
   * Compute standard View Matrix and RTC View Matrix
   */
  public getRtcMatrices(): {
    rtcCenter: Vector3;
    viewMatrix: Matrix4;
    rtcViewMatrix: Matrix4;
    projectionMatrix: Matrix4;
  } {
    const viewMatrix = new Matrix4().lookAt(
      this.cameraPosition,
      this.cameraTarget,
      this.upVector
    );

    // RTC View Matrix shifts translation origin to cameraPosition
    const rtcCenter = this.cameraPosition.clone();
    const rtcTranslation = new Matrix4().set(
      1, 0, 0, -this.cameraPosition.x,
      0, 1, 0, -this.cameraPosition.y,
      0, 0, 1, -this.cameraPosition.z,
      0, 0, 0, 1
    );

    const rtcViewMatrix = viewMatrix.clone().multiply(rtcTranslation);

    const altitudeConfig = this.getAltitudeRegime();
    const projectionMatrix = new PerspectiveCamera(
      60, // FOV 60 deg
      1.0,
      altitudeConfig.nearPlane,
      altitudeConfig.farPlane
    ).projectionMatrix;

    return {
      rtcCenter,
      viewMatrix,
      rtcViewMatrix,
      projectionMatrix,
    };
  }

  /**
   * Logarithmic depth formula z_log
   * z_log = log(c * z_view + 1.0) / log(c * z_far + 1.0) * z_clip.w
   */
  public computeLogDepth(zView: number, farPlane: number, cConstant: number): number {
    if (zView <= 0) return 0;
    const numerator = Math.log(cConstant * zView + 1.0);
    const denominator = Math.log(cConstant * farPlane + 1.0);
    return numerator / denominator;
  }
}
