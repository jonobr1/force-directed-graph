# Cross-Pollination: umap → force-directed-graph

Techniques and performance gains gleaned from the umap particle rendering pipeline that could apply to this library.

---

## 1. Ping-Pong Render Targets (High Impact)

umap uses a dedicated `PingPongRenderTarget` class for double-buffered GPU simulation — read from one target while writing to the other, then swap. force-directed-graph relies on `GPUComputationRenderer` which handles this internally, but it carries overhead and abstraction cost. A leaner, hand-rolled ping-pong approach could give more control over the simulation pipeline and reduce per-frame overhead for the velocity/position passes.

## 2. Adaptive Timestep Clamping (Medium Impact)

umap clamps `dt` between 1/240s and 1/30s, and *springs* toward the target dt over 0.5s. This library uses a fixed `timeStep` uniform, which means when a tab is backgrounded and returns, a massive dt spike can destabilize the simulation. Adopting clamped + smoothed dt would prevent physics explosions on resume.

## 3. Adaptive Quality Degradation (High Impact)

umap has a performance monitor that automatically:
- Reduces `pixelRatio` by 0.75x
- Halves MSAA samples
- Disables alpha hashing

This library has no adaptive quality system. For large graphs (5K+ nodes), auto-reducing quality (e.g., disabling link rendering, reducing point size, lowering simulation frequency) when FPS drops below a threshold would dramatically improve perceived performance.

## 4. Velocity-Based Visual Effects (Medium Impact, UX Win)

umap stretches particles along their velocity vector and brightens faster-moving particles. This is a cheap shader trick that communicates motion beautifully. Nodes here are rendered as static circles regardless of velocity. Adding:
- Point size modulation based on velocity magnitude
- Subtle color brightening for fast-moving nodes
- Optional motion-blur-like elongation

...would make the simulation feel much more alive during layout convergence.

## 5. Curl Noise for Ambient Motion (Low-Medium Impact)

After the graph converges (alpha decays to 0), everything goes static. umap uses 4D curl noise (divergence-free Perlin noise) to create beautiful ambient particle drift. Adding a subtle curl noise wind force when alpha is near zero could keep the graph visually engaging post-convergence, which is often the state users interact with most.

## 6. Instance Matrix Metadata Packing (Medium Impact)

umap encodes per-particle metadata (texture UVs, color indices) in the unused 4th row of the InstancedMesh transform matrix, avoiding extra attribute buffers. If nodes ever move from `THREE.Points` to `InstancedMesh` for richer rendering (shapes, icons), this trick saves a buffer allocation per attribute.

## 7. Boundary Soft Clamping (Low Impact, Stability Win)

umap decelerates particles as they approach bounds rather than hard-clamping. The velocity shader clamps to `maxSpeed` but has no spatial bounds. Adding soft boundary forces would prevent nodes from flying off-screen during layout, especially useful when `gravity` is low.

## 8. Transferable ArrayBuffer Discipline (Already Partially Done)

umap is meticulous about transferring (not copying) ArrayBuffers between worker and main thread. The worker pipeline here already does this for texture data, but the pattern could be applied more broadly — e.g., when returning hit-detection results or position queries.

---

## Big Architectural Opportunity: InstancedMesh Instead of Points

umap renders 256K+ particles using `InstancedMesh` with custom materials, getting:
- Per-instance colors, sizes, textures
- Proper depth testing and lighting
- Velocity-based deformation
- Rich PBR materials (metalness, roughness, iridescence)

The `THREE.Points` approach is simpler and faster for basic circles, but limits visual richness and has known issues with depth sorting and size capping across GPUs. Migrating to `InstancedBufferGeometry` with small quads or simple meshes would unlock richer node rendering while maintaining GPU performance.

---

## What Probably Doesn't Apply

- **Post-processing pipeline** (bloom, SSR, color grading) — overkill for a graph library
- **PLY loading / densification** — different data domain
- **Fluid simulation integration** — too specialized
- **Lightning/flow line generation** — different visual goal

---

## Priority Ranking

| Technique | Effort | Impact | Recommendation |
|-----------|--------|--------|----------------|
| Adaptive quality degradation | Low | High | Do first — simple FPS monitor + parameter throttling |
| Adaptive timestep clamping | Low | Medium | Quick win for stability |
| Velocity-based visual effects | Low | Medium | Cheap shader additions |
| Ping-pong render targets | Medium | Medium | Consider if perf-profiling shows GPUComputationRenderer overhead |
| Curl noise ambient motion | Medium | Medium | Nice UX polish post-convergence |
| InstancedMesh migration | High | High | Major upgrade path for visual quality |
| Soft boundary clamping | Low | Low | Minor stability improvement |
