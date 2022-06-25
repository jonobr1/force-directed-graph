declare module "math" {
    export function getPotSize(number: any): number;
}
declare module "shaders" {
    export namespace links {
        const vertexShader: string;
        const fragmentShader: string;
    }
    export namespace points {
        const vertexShader_1: string;
        export { vertexShader_1 as vertexShader };
        const fragmentShader_1: string;
        export { fragmentShader_1 as fragmentShader };
    }
    export const positionsFragment: "\n  uniform float timeStep;\n  void main() {\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    vec2 position = texture2D( texturePositions, uv ).xy;\n    vec2 velocity = texture2D( textureVelocities, uv ).xy;\n    vec2 result = position + velocity * timeStep;\n    gl_FragColor = vec4( result.xy, 0.0, 0.0 );\n  }\n";
    export const velocitiesFragment: "\n  uniform float size;\n  uniform float time;\n  uniform float nodeRadius;\n  uniform float nodeAmount;\n  uniform float edgeAmount;\n  uniform float maxSpeed;\n  uniform float timeStep;\n  uniform float damping;\n  uniform float repulsion;\n  uniform float springLength;\n  uniform float stiffness;\n  uniform float gravity;\n  uniform sampler2D textureEdges;\n  vec2 getPosition( vec2 uv ) {\n    return texture2D( texturePositions, uv ).xy;\n  }\n  vec2 getVelocity( vec2 uv ) {\n    return texture2D( textureVelocities, uv ).xy;\n  }\n  vec2 getAcceleration( vec2 uv ) {\n    return texture2D( textureVelocities, uv ).zw;\n  }\n  int getIndex( vec2 uv ) {\n    int s = int( size );\n    int col = int( uv.x * size );\n    int row = int( uv.y * size );\n    return col + row * s;\n  }\n  float random( vec2 seed ) {\n    return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );\n  }\n  float jiggle( float index ) {\n    return ( random( vec2( index, time ) ) - 0.5 ) * 0.000001;\n  }\n  vec2 collide( float count, int id1, vec2 p1, vec2 v1 ) {\n    float r2 = nodeRadius * nodeRadius;\n    float xi = p1.x + v1.x;\n    float yi = p1.y + v1.y;\n    float r  = 2.0 * nodeRadius;\n    vec2 result = vec2( 0.0 );\n    for ( float i = 0.0; i < count; i += 1.0 ) {\n      float uvx = mod( i, size ) / size;\n      float uvy = floor( i / size ) / size;\n      vec2 uv2 = vec2( uvx, uvy );\n      int id2 = getIndex( uv2 );\n      vec2 v2 = getVelocity( uv2 );\n      vec2 p2 = getPosition( uv2 );\n      if ( id2 != id1 ) {\n        float x = xi - ( p2.x + v2.x );\n        float y = yi - ( p2.y + v2.y );\n        float l = x * x + y * y;\n        float seed = float( id1 + id2 );\n        if ( l < r2 ) {\n          if ( abs( x ) <= 0.1 ) {\n            x = jiggle( seed );\n            l += x * x;\n          }\n          if ( abs( y ) <= 0.1 ) {\n            y = jiggle( seed );\n            l += y * y;\n          }\n          result.x += (x *= l) * r;\n          result.y += (y *= l) * r;\n        }\n      }\n    }\n    return result;\n  }\n  vec2 link( float count, int id1, vec2 p1, vec2 v1 ) {\n    vec2 result = vec2( 0.0 );\n    for ( float i = 0.0; i < count; i += 1.0 ) {\n      float uvx = mod( i, size ) / size;\n      float uvy = floor( i / size ) / size;\n      vec4 edge = texture2D( textureEdges, vec2( uvx, uvy ) );\n      vec2 source = edge.xy;\n      vec2 target = edge.zw;\n      int si = getIndex( source );\n      float siF = float( si );\n      vec2 sv = getVelocity( source );\n      vec2 sp = getPosition( source );\n      int ti = getIndex( target );\n      float tiF = float( ti );\n      vec2 tv = getVelocity( target );\n      vec2 tp = getPosition( target );\n      float x = tp.x + tv.x - ( sp.x + sv.x );\n      float y = tp.y + tv.y - ( sp.y + sv.y );\n      float seed = float( si + ti );\n      if ( abs( x ) <= 0.1 ) {\n        x = jiggle( seed );\n      }\n      if ( abs( y ) <= 0.1 ) {\n        y = jiggle( seed );\n      }\n      float bias = 0.5;\n      float l = sqrt( x * x + y * y );\n      l = stiffness * ( l - springLength ) / l;\n      x *= l;\n      y *= l;\n      if ( id1 == ti ) {\n        result -= vec2( x, y ) * bias;\n      } else if ( id1 == si ) {\n        result += vec2( x, y ) * bias;\n      }\n    }\n    return result;\n  }\n  vec2 charge( float count, int id1, vec2 p1, vec2 v1 ) {\n    vec2 result = vec2( 0.0 );\n    for ( float i = 0.0; i < count; i += 1.0 ) {\n      float uvx = mod( i, size ) / size;\n      float uvy = floor( i / size ) / size;\n      vec2 uv2 = vec2( uvx, uvy );\n      int id2 = getIndex( uv2 );\n      vec2 v2 = getVelocity( uv2 );\n      vec2 p2 = getPosition( uv2 );\n      vec2 diff = ( p2 + v2 ) - ( p1 + v1 );\n      float dist = length( diff );\n      float magnitude = repulsion / dist;\n      float cutoff = ( 1.0 - step( springLength * 10.0, dist ) );\n      vec2 dir = normalize( diff );\n      if ( id1 != id2 ) {\n        result += dir * magnitude;// * cutoff;\n      }\n    }\n    return result;\n  }\n  vec2 center( vec2 p1 ) {\n    vec2 result = - p1 * gravity * 0.1;\n    return result;\n  }\n  void main() {\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    int id1 = getIndex( uv );\n    vec2 p1 = getPosition( uv );\n    vec2 v1 = getVelocity( uv );\n    vec2 a1 = getAcceleration( uv );\n    // Calculate Acceleration\n    // 1.\n    vec2 a = collide( nodeAmount, id1, p1, v1 );\n    a *= 1.0 - step( nodeAmount, float( id1 ) );\n    // 2.\n    vec2 b = link( edgeAmount, id1, p1, v1 );\n    b *= 1.0 - step( edgeAmount, float( id1 ) );\n    // 3.\n    vec2 c = charge( nodeAmount, id1, p1, v1 );\n    c *= 1.0 - step( nodeAmount, float( id1 ) );\n    // 4.\n    vec2 d = center( p1 );\n    vec2 acceleration = a + b + c + d;\n    // Calculate Velocity\n    vec2 velocity = ( v1 + ( acceleration * timeStep ) ) * damping;\n    velocity = clamp( velocity, - maxSpeed, maxSpeed );\n    gl_FragColor = vec4( velocity, acceleration );\n  }\n";
}
declare module "points" {
    export class Points {
        constructor(size: any, { data, uniforms }: {
            data: any;
            uniforms: any;
        });
        frustumCulled: boolean;
    }
}
declare module "links" {
    export class Links {
        constructor(points: any, { data, uniforms }: {
            data: any;
            uniforms: any;
        });
        frustumCulled: boolean;
    }
}
declare module "index" {
    export class ForceDirectedGraph {
        static getPotSize: typeof getPotSize;
        constructor(renderer: any, data: any);
        update(time: any): ForceDirectedGraph;
        getUniforms(): any;
        getTexture(name: any): any;
        getSize(): any;
        setFrustumSize(size: any): void;
        getNodeCount(): any;
        getEdgeCount(): any;
    }
    import { getPotSize } from "math";
}
