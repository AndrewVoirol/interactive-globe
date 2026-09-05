// ============================================================================
// WGSL Header: Unpacking rgba16unorm 4-Stream DEM Textures
// ============================================================================

const Z_MAX_LAND: f32 = 8848.0;
const D_MAX_OCEAN: f32 = 10924.0;
const Z_MIN_GLOBAL: f32 = -10924.0;
const Z_SPAN_GLOBAL: f32 = 19772.0;

struct UnpackedTerrain {
    landElevationMeters: f32,    // 0.0 to 8848.0 m
    oceanDepthMeters: f32,       // 0.0 to 10924.0 m (positive down)
    signedElevationMeters: f32,  // -10924.0 to +8848.0 m (true physical geoid elevation)
    landFraction: f32,           // 0.0 (ocean) to 1.0 (land), smooth anti-aliased
    isLand: bool,
};

// Fast branchless unpacker
fn unpackTerrainRGBA16(sampledTexel: vec4<f32>) -> UnpackedTerrain {
    var out: UnpackedTerrain;
    
    // Direct linear scaling
    out.landElevationMeters = sampledTexel.r * Z_MAX_LAND;
    out.oceanDepthMeters    = sampledTexel.g * D_MAX_OCEAN;
    out.landFraction        = sampledTexel.b;
    out.isLand              = sampledTexel.b > 0.5;
    
    // Method 1: Recover signed elevation directly from Alpha channel
    // Precision: 0.3017 meters
    let elevFromAlpha = Z_MIN_GLOBAL + sampledTexel.a * Z_SPAN_GLOBAL;
    
    // Method 2: Recover signed elevation via split Red and Green channels
    // Precision: 0.1350 meters on land, 0.1667 meters in ocean
    let elevFromSplit = select(-out.oceanDepthMeters, out.landElevationMeters, out.isLand);
    
    // Select high-resolution split channel, preserving elevFromAlpha derivation
    out.signedElevationMeters = select(elevFromAlpha, elevFromSplit, true);
    return out;
}
