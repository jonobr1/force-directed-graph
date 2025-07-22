/**
 * Simplified nearest neighbors computation shader
 * Finds the N closest neighbors for each node using basic distance comparison
 * Avoids complex sorting algorithms to prevent shader compilation issues
 */
export const nearestNeighborsSimple = `
  uniform float size;
  uniform float nodeAmount;
  uniform float nearestNeighborCount;
  uniform float maxSearchRadius;

  vec3 getPosition( vec2 uv ) {
    return texture2D( texturePositions, uv ).xyz;
  }

  int getIndex( vec2 uv ) {
    int s = int( size );
    int col = int( uv.x * size );
    int row = int( uv.y * size );
    return col + row * s;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    int nodeId = getIndex(uv);
    
    // Skip processing for nodes beyond the actual node count
    if (float(nodeId) >= nodeAmount) {
      gl_FragColor = vec4(-1.0, -1.0, -1.0, -1.0);
      return;
    }

    vec3 nodePosition = getPosition(uv);
    
    // Store the 4 closest neighbors and their distances
    float neighbors[4];
    float distances[4];
    
    // Initialize with invalid values
    for (int i = 0; i < 4; i++) {
      neighbors[i] = -1.0;
      distances[i] = 99999.0;
    }
    
    // Search through all nodes for the closest neighbors
    for (float i = 0.0; i < nodeAmount; i += 1.0) {
      if (i == float(nodeId)) continue; // Skip self
      
      float uvx = mod(i, size) / size;
      float uvy = floor(i / size) / size;
      vec2 otherUv = vec2(uvx, uvy);
      
      vec3 otherPosition = getPosition(otherUv);
      vec3 diff = otherPosition - nodePosition;
      float distSq = dot(diff, diff);
      
      // Skip if beyond maximum search radius
      if (distSq > maxSearchRadius * maxSearchRadius) {
        continue;
      }
      
      // Check if this neighbor is closer than any current neighbor
      for (int j = 0; j < 4; j++) {
        if (distSq < distances[j]) {
          // Shift existing neighbors down
          for (int k = 3; k > j; k--) {
            neighbors[k] = neighbors[k-1];
            distances[k] = distances[k-1];
          }
          // Insert new neighbor
          neighbors[j] = i;
          distances[j] = distSq;
          break;
        }
      }
    }
    
    // Output the 4 closest neighbors (RGBA channels)
    gl_FragColor = vec4(neighbors[0], neighbors[1], neighbors[2], neighbors[3]);
  }
`;