# Label Density Sorting Research

This branch implements the label-density behavior with a visibility mask and deterministic screen-space selection. It does **not** ship a full GPU-side sort/resolve stack yet. This note records the GPU sorting options that were evaluated against the current WebGL render-target architecture.

## Constraints

- Current runtime is Three.js `GPUComputationRenderer` with fragment-pass ping-pong render targets.
- No compute shaders, atomics, or scatter writes.
- Label placement data is naturally screen-space and changes with camera movement.
- Determinism matters more than absolute throughput for the first version.

## Candidates

| Algorithm | WebGL fragment-pass fit | Approx. passes at 1k / 5k / 10k labels | Tuple packing complexity | Incremental update behavior | Notes |
| --- | --- | --- | --- | --- | --- |
| Bitonic merge sort | Best | 55 / 91 / 105 | Low | Poor | Best match for a future all-GPU WebGL implementation. Regular compare-swap network, deterministic, easy to encode as `(cellId, -priority, stableId, labelId)`. |
| Odd-even merge sort | Good | ~65 / ~104 / ~119 | Low | Better | More passes than bitonic in the graphics-pipeline formulation, but intermediate states are more usable if placement work is amortized across frames. |
| Radix sort | Poor in current stack | Depends on radix; typically 4+ histogram/scan/scatter stages for 32-bit keys | High | Good | Fastest family in compute-oriented GPU literature, but it depends on scan/scatter primitives that are awkward in this WebGL path. |
| Parallel merge sort | Poor in current stack | `O(n log n)` with block sorts + merges | Medium/High | Fair | Better suited to compute-capable backends where block-local shared memory and parallel merge partitioning are available. |

Pass counts are based on the next power-of-two label count for comparison-network sorts:

- `1k -> 1024 -> 10 stages -> 55 bitonic passes`
- `5k -> 8192 -> 13 stages -> 91 bitonic passes`
- `10k -> 16384 -> 14 stages -> 105 bitonic passes`

## Decision

If the label placement stage moves fully onto the GPU while staying in the current WebGL render-target model, `bitonic merge sort` is the default path to implement first.

Use `odd-even merge sort` only if the placement work needs to be spread across multiple displayed frames and partially converged intermediate orderings become more valuable than one-shot latency.

`Radix sort` and modern parallel merge variants remain future candidates for a compute-shader/WebGPU backend.
