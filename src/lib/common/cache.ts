import NodeCache from "node-cache";

// Cache for projects, TTL = 60 seconds
export const projectCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
