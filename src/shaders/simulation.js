import { positions } from "./positions.js";
import { simplex, nested, types } from "./velocities.js";
import { spatial, spatialSimplified } from "./velocities-spatial.js";

export default {
  positions,
  velocities: simplex,
  simplex,
  nested,
  spatial,
  spatialSimplified,
  types: [...types, "spatial", "spatialSimplified"]
};