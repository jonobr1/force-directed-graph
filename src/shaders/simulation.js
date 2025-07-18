import { positions } from "./positions.js";
import { simplex, nested, optimized, types } from "./velocities.js";
import { nearestNeighborsSimple } from "./nearest-neighbors-simple.js";

export default {
  positions,
  velocities: nested,
  simplex,
  nested,
  optimized,
  nearestNeighbors: nearestNeighborsSimple,
  types
};