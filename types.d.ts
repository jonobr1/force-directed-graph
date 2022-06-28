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
    export const positionsFragment: "\n  uniform float is2D;\n  uniform float timeStep;\n\n  void main() {\n\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    vec3 position = texture2D( texturePositions, uv ).xyz;\n    vec3 velocity = texture2D( textureVelocities, uv ).xyz;\n\n    vec3 result = position + velocity * timeStep;\n\n    gl_FragColor = vec4( result.xyz, 0.0 );\n\n  }\n";
    export const velocitiesFragment: "\n  uniform float alpha;\n  uniform float is2D;\n  uniform float size;\n  uniform float time;\n  uniform float nodeRadius;\n  uniform float nodeAmount;\n  uniform float edgeAmount;\n  uniform float maxSpeed;\n  uniform float timeStep;\n  uniform float damping;\n  uniform float repulsion;\n  uniform float springLength;\n  uniform float stiffness;\n  uniform float gravity;\n  uniform sampler2D textureEdges;\n\n  vec3 getPosition( vec2 uv ) {\n    return texture2D( texturePositions, uv ).xyz;\n  }\n\n  vec3 getVelocity( vec2 uv ) {\n    return texture2D( textureVelocities, uv ).xyz;\n  }\n\n  int getIndex( vec2 uv ) {\n    int s = int( size );\n    int col = int( uv.x * size );\n    int row = int( uv.y * size );\n    return col + row * s;\n  }\n\n  float random( vec2 seed ) {\n    return fract( sin( dot( seed.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );\n  }\n\n  float jiggle( float index ) {\n    return ( random( vec2( index, time ) ) - 0.5 ) * 0.000001;\n  }\n\n  vec3 link( float i, int id1, vec3 p1, vec3 v1, vec2 uv2 ) {\n\n    vec3 result = vec3( 0.0 );\n\n    vec4 edge = texture2D( textureEdges, uv2 );\n\n    vec2 source = edge.xy;\n    vec2 target = edge.zw;\n\n    int si = getIndex( source );\n    float siF = float( si );\n    vec3 sv = getVelocity( source );\n    vec3 sp = getPosition( source );\n\n    int ti = getIndex( target );\n    float tiF = float( ti );\n    vec3 tv = getVelocity( target );\n    vec3 tp = getPosition( target );\n\n    vec3 diff = tp + tv - ( sp + sv );\n    diff.z *= 1.0 - is2D;\n\n    vec3 mag = abs( diff );\n    float seed = float( si + ti );\n\n    float bias = 0.5;\n    float dist = length( diff );\n\n    dist = stiffness * ( dist - springLength ) / dist;\n    diff *= dist;\n\n    if ( id1 == ti ) {\n      result -= diff * bias;\n    } else if ( id1 == si ) {\n      result += diff * bias;\n    }\n\n    result.z *= 1.0 - is2D;\n\n    return result;\n\n  }\n\n  vec3 charge( float i, int id1, vec3 p1, vec3 v1, int id2, vec3 v2, vec3 p2 ) {\n\n    vec3 result = vec3( 0.0 );\n\n    vec3 diff = ( p2 + v2 ) - ( p1 + v1 );\n    diff.z *= 1.0 - is2D;\n\n    float dist = length( diff );\n    float mag = repulsion / dist;\n\n    vec3 dir = normalize( diff );\n\n    if ( id1 != id2 ) {\n      result += dir * mag;\n    }\n\n    result.z *= 1.0 - is2D;\n\n    return result;\n\n  }\n\n  vec3 center( vec3 p1 ) {\n    return - p1 * gravity * 0.1;\n  }\n\n  void main() {\n\n    vec2 uv = gl_FragCoord.xy / resolution.xy;\n    int id1 = getIndex( uv );\n\n    vec3 p1 = getPosition( uv );\n    vec3 v1 = getVelocity( uv );\n\n    vec3 a = vec3( 0.0 ),\n         b = vec3( 0.0 ),\n         c = vec3( 0.0 );\n\n    for ( float i = 0.0; i < max( nodeAmount, edgeAmount ); i += 1.0 ) {\n\n      float uvx = mod( i, size ) / size;\n      float uvy = floor( i / size ) / size;\n\n      vec2 uv2 = vec2( uvx, uvy );\n\n      int id2 = getIndex( uv2 );\n      vec3 v2 = getVelocity( uv2 );\n      vec3 p2 = getPosition( uv2 );\n\n      // 2.\n      if ( i < edgeAmount ) {\n        b += link( i, id1, p1, v1, uv2 );\n      }\n\n      // 3.\n      if ( i < nodeAmount) {\n        c += charge( i, id1, p1, v1, id2, p2, v2 );\n      }\n\n    }\n\n    // a *= 1.0 - step( nodeAmount, float( id1 ) );\n    b *= 1.0 - step( edgeAmount, float( id1 ) );\n    c *= 1.0 - step( nodeAmount, float( id1 ) );\n\n    // 4.\n    vec3 d = center( p1 );\n    vec3 acceleration = a + b + c + d;\n\n    // Calculate Velocity\n    vec3 velocity = ( v1 + ( acceleration * timeStep ) ) * damping * alpha;\n    velocity = clamp( velocity, - maxSpeed, maxSpeed );\n    velocity.z *= 1.0 - is2D;\n\n    gl_FragColor = vec4( velocity, 0.0 );\n\n  }\n";
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
        setBlendMode(mode: any): void;
    }
    import { getPotSize } from "math";
}
