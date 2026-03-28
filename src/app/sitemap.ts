import type { MetadataRoute } from "next";

const BASE_URL = "https://flowstate.network";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, priority: 1.0 },
    { url: `${BASE_URL}/explore`, priority: 0.9 },
    { url: `${BASE_URL}/projects`, priority: 0.8 },
    { url: `${BASE_URL}/flow-councils`, priority: 0.8 },
    { url: `${BASE_URL}/flow-splitters`, priority: 0.8 },
    { url: `${BASE_URL}/pools`, priority: 0.7 },
    { url: `${BASE_URL}/flow-qf`, priority: 0.6 },
    { url: `${BASE_URL}/octant`, priority: 0.5 },
    { url: `${BASE_URL}/privacy`, priority: 0.2 },
    { url: `${BASE_URL}/terms`, priority: 0.2 },
    { url: `${BASE_URL}/conduct`, priority: 0.2 },
  ];
}
