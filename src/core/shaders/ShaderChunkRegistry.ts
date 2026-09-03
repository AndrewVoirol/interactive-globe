/**
 * Indicatrix Engine: Shader Chunk Registry
 * Deduplicated, reusable GLSL shader chunks shared across WebGL2 pipelines
 * (App.tsx point cloud shader and VectorOverlayLayer.tsx line shader)
 */

export const computeCurlNoiseGLSL = `
// Analytical 3D Solenoidal Vector Field (div u = 0 guaranteed, zero Cartesian lattice)
vec3 computeCurlNoise(vec3 p, float time) {
    float t = time * 0.75;
    
    mat3 rot = mat3(
         0.00,  0.80,  0.60,
        -0.80,  0.36, -0.48,
        -0.60, -0.48,  0.64
    );
    vec3 q1 = rot * p * 0.45;
    vec3 q2 = rot * rot * p * 0.95;

    float u_x = -0.55 * cos(0.55 * q1.y + t * 0.7) - 0.45 * cos(0.95 * q1.z - t * 0.5);
    float u_y = -0.55 * cos(0.55 * q1.z + t * 0.9) - 0.45 * cos(0.95 * q1.x - t * 0.6);
    float u_z = -0.55 * cos(0.55 * q1.x + t * 0.8) - 0.45 * cos(0.95 * q1.y - t * 0.4);

    float u2_x = 0.25 * sin(1.5 * q2.y - t * 1.2);
    float u2_y = 0.25 * sin(1.5 * q2.z - t * 1.1);
    float u2_z = 0.25 * sin(1.5 * q2.x - t * 1.3);

    return rot * vec3(u_x + u2_x, u_y + u2_y, u_z + u2_z);
}
`;

export const mode1CylindricalScrollGLSL = `
    float t = ease;
    float lambda = atan(pos3D.x, pos3D.z);
    float curR = length(pos3D);
    float phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));
    float oneMinusT = 1.0 - t;

    if (oneMinusT > 0.001) {
        float invOneMinusT = 1.0 / oneMinusT;
        float curAngle = oneMinusT * lambda;
        
        float curX = (curR * invOneMinusT) * sin(curAngle);
        float curZ = (curR * cos(phi) * invOneMinusT) * (cos(curAngle) - 1.0) + (curR * cos(phi) * oneMinusT);
        float curY = mix(pos3D.y, pos2D.y, t);
        finalPos = vec3(curX, curY, curZ);

        vec3 T_lambda = vec3(curR * cos(curAngle), 0.0, -curR * cos(phi) * sin(curAngle));
        vec3 T_phi = vec3(0.0, mix(curR * cos(phi), curR / max(cos(phi), 0.05), t), -curR * sin(phi) * invOneMinusT * (cos(curAngle) - 1.0) - curR * sin(phi) * oneMinusT);
        vec3 rawNorm = cross(T_lambda, T_phi);
        dynamicNormal = length(rawNorm) > 0.0001 ? normalize(rawNorm) : normalize(pos3D);
    } else {
        // Taylor Series Guard for oneMinusT <= 0.001 (prevents division by zero & cancellation)
        float u = oneMinusT * lambda;
        float sinTerm = lambda * (1.0 - (u * u) / 6.0);
        float cosTerm = oneMinusT * (lambda * lambda) * (-0.5 + (u * u) / 24.0);
        float curX = curR * sinTerm;
        float curZ = curR * cos(phi) * cosTerm + curR * cos(phi) * oneMinusT;
        float curY = mix(pos3D.y, pos2D.y, t);
        finalPos = vec3(curX, curY, curZ);
        dynamicNormal = vec3(0.0, 0.0, 1.0);
    }
`;

export const mode2GriffithFractureGLSL = `
    float t = ease;
    float lambda = atan(pos3D.x, pos3D.z);
    float curR = length(pos3D);
    float phi = asin(clamp(pos3D.y / curR, -1.0, 1.0));
    
    float distToSeam = PI - abs(lambda);
    float seamFactor = 1.0 - smoothstep(0.0, 0.75, distToSeam);
    float tRupture = 0.18;
    
    float hitDist = length(pos3D - u_cursorHitPos);
    float cursorInfluence = u_cursorActive * exp(-hitDist * hitDist / (2.0 * 0.64));
    float hoopStress = cursorInfluence * 0.45 * (1.0 + 2.0 * cos(phi) * cos(phi));
    
    if (t < tRupture) {
        float strainProgress = t / tRupture;
        localStrain = seamFactor * strainProgress * max(0.2, cos(phi * 0.85)) + hoopStress;
        vec3 outwardTension = normalize(pos3D) * (localStrain * 0.30);
        finalPos = pos3D + outwardTension;
        dynamicNormal = normalize(finalPos);
    } else {
        float postRuptureT = smoothstep(tRupture, 1.0, t);
        float crackLatitudeFront = (PI * 0.5) * smoothstep(tRupture, 0.60, t);
        float distToCrackTip = abs(abs(phi) - crackLatitudeFront);
        float crackTipGlow = (t < 0.65 && seamFactor > 0.3) ? (1.0 - smoothstep(0.0, 0.3, distToCrackTip)) : 0.0;
        
        float flutterWave = sin(distToSeam * 16.0 - t * 24.0);
        float flutterDecay = exp(-4.2 * (t - tRupture));
        float flutterAmp = (0.50 * seamFactor + cursorInfluence * 0.20) * flutterWave * flutterDecay;
        vec3 flutterOffset = vec3(0.0, 0.0, flutterAmp);

        vec3 peeledPos = mix(pos3D, pos2D, postRuptureT);
        finalPos = peeledPos + flutterOffset;

        localStrain = mix(seamFactor * (1.0 - postRuptureT) * 0.9 + crackTipGlow + hoopStress, 0.0, pow(postRuptureT, 1.8));
        dynamicNormal = mix(normalize(pos3D), vec3(0.0, 0.0, 1.0), postRuptureT);
    }
`;

export const mode3FluidAdvectionGLSL = `
    float t = ease;
    float rawSin = sin(PI * clampedUnfurl);
    float liquefaction = pow(max(0.0, rawSin), 1.15);
    vec3 unElevatedSphere = normalize(pos3D) * RADIUS;
    vec3 unElevatedMap = vec3(target2D.x, target2D.y, 0.0);
    vec3 basePos = mix(unElevatedSphere, unElevatedMap, t);
    vec3 naturalVelocity = computeCurlNoise(basePos, u_time);
    
    float hitDist = length(basePos - u_cursorHitPos);
    float coreRadius = 0.85;
    float vortexCirculation = (1.0 - exp(-hitDist * hitDist / (coreRadius * coreRadius))) / (hitDist + 0.05);
    vec3 surfaceNormal = length(basePos) > 0.001 ? normalize(basePos) : vec3(0.0, 0.0, 1.0);
    vec3 vortexTangent = normalize(cross(surfaceNormal, basePos - u_cursorHitPos + vec3(0.001)));
    float clampedSpeed = clamp(u_cursorVel.w, 0.0, 1.5);
    vec3 vortexVelocity = vortexTangent * (u_cursorActive * clampedSpeed * vortexCirculation * 0.35);
    vec3 wakeAdvection = normalize(u_cursorVel.xyz + vec3(0.0001)) * (clampedSpeed * 0.15 * u_cursorActive * exp(-hitDist * hitDist / 1.5));

    float wavePhase1 = dot(basePos, vec3(0.35, 0.62, 0.42)) * 1.35 - u_time * 1.25;
    float wavePhase2 = dot(basePos, vec3(-0.45, 0.30, 0.65)) * 1.75 - u_time * 0.90;
    float silkWave = (sin(wavePhase1) * 0.65 + cos(wavePhase2) * 0.35) * liquefaction * 0.65;
    vec3 silkDrapeOffset = surfaceNormal * silkWave;

    vec3 advectionOffset = naturalVelocity * (liquefaction * 1.55) + silkDrapeOffset + (vortexVelocity + wakeAdvection) * (u_cursorActive * 0.25);

    vec3 totalVelocity = naturalVelocity + vortexVelocity + wakeAdvection;
    localVorticity = length(totalVelocity) * max(liquefaction, u_cursorActive * 0.3);

    finalPos = basePos + advectionOffset;
    dynamicNormal = mix(normalize(unElevatedSphere + silkDrapeOffset * 0.5), vec3(0.0, 0.0, 1.0), t);
`;

export const mode4FullerDymaxionGLSL = `
    float t = ease;
    vec3 dymaxionPos2D = vec3(dymaxion2D.x, dymaxion2D.y, 0.0);
    float arch = sin(PI * clampedUnfurl) * 0.45;
    vec3 sphereNorm = length(pos3D) > 0.001 ? normalize(pos3D) : vec3(0.0, 0.0, 1.0);
    finalPos = mix(pos3D, dymaxionPos2D, t) + sphereNorm * arch;
    dynamicNormal = mix(sphereNorm, vec3(0.0, 0.0, 1.0), t);
`;
