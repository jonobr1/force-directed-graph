# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Force Directed Graph** library - a GPU-accelerated Three.js-based library for creating force-directed graph visualizations. The library uses WebGL compute shaders (GPGPU) for high-performance physics simulation of thousands of nodes and links.

## Key Architecture

### Core Components
- **ForceDirectedGraph** (`src/index.js`): Main class extending Three.js Group, manages GPGPU simulation
- **Points** (`src/points.js`): Renders graph nodes as point sprites
- **Links** (`src/links.js`): Renders graph edges as line segments
- **Registry** (`src/registry.js`): Maps node IDs to indices for efficient lookups
- **Hit** (`src/hit.js`): Handles mouse/touch interaction with graph nodes

### GPU Compute Pipeline
- Uses Three.js `GPUComputationRenderer` for physics simulation
- **Position shader**: Updates node positions based on velocities
- **Velocity shader**: Calculates forces (repulsion, spring, gravity) between nodes
- Operates on texture-based data for parallel processing

### Data Structure
Expects D3.js-compatible data format:
```javascript
{
  nodes: [{ id, x?, y?, z?, isStatic? }, ...],
  links: [{ source, target }, ...]
}
```

## Development Commands

```bash
# Development server with live reload
npm run dev

# Build all variants (UMD, ES module, browser)
npm run build

# Lint and fix code
npm run lint

# Generate TypeScript definitions
npm run types
```

## Build System

- **esbuild** handles bundling with Three.js as external dependency
- Builds three variants: UMD, ES module, and browser-compatible
- Custom build script (`utils/build.js`) adds global window assignment for browser usage
- TypeScript definitions generated from JSDoc comments

## WASM + Web Worker Architecture

### Performance Optimization
- **AssemblyScript WASM**: High-performance texture processing (`src/wasm/texture-processor.ts`)
- **Web Worker**: Off-main-thread processing (`src/workers/texture-worker.js`)
- **Worker Manager**: Lifecycle management (`src/texture-worker-manager.js`)
- **Graceful fallback**: Falls back to main thread `requestAnimationFrame` chunking

### Processing Pipeline
1. **Worker initialization**: WASM module loaded in worker thread
2. **Data preparation**: Node/link data serialized for worker
3. **WASM processing**: High-speed texture data generation
4. **Result transfer**: Transferable ArrayBuffers returned to main thread
5. **Fallback handling**: Automatic fallback on worker/WASM failure

### Performance Monitoring
- `fdg.getPerformanceInfo()`: Worker and WASM status
- `fdg.isWorkerProcessingAvailable()`: Check worker availability
- `fdg.isWasmAccelerationAvailable()`: Check WASM availability

### Build Process
- **AssemblyScript compilation**: `npm run build:wasm`
- **WASM integration**: Automatic WASM build before JavaScript bundling
- **Worker bundling**: Workers included in distribution

## Important Notes

- **GPU-dependent**: Requires WebGL2 support, not suitable for Node.js
- **Three.js peer dependency**: Must be installed separately
- **Texture-based simulation**: Node/link count must fit power-of-2 texture dimensions
- **Performance-critical**: Changes to shader files (`src/shaders/`) affect physics simulation
- **Worker support**: Gracefully degrades when Web Workers or WASM unavailable