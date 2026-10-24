/**
 * Map tile source, selected by VITE_MAP_PROVIDER. Defaults to OpenStreetMap,
 * which needs no API key -- so maps work out of the box in every
 * environment, and a real key-based provider (mapbox/maptiler) can be
 * swapped in later purely via env vars, no code change.
 */
const provider = import.meta.env.VITE_MAP_PROVIDER || 'osm'
const apiKey = import.meta.env.VITE_MAP_API_KEY

interface TileConfig {
  url: string
  attribution: string
}

const CONFIGS: Record<string, (key?: string) => TileConfig> = {
  osm: () => ({
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
  maptiler: (key) => ({
    url: `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key ?? ''}`,
    attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap contributors',
  }),
  mapbox: (key) => ({
    url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${key ?? ''}`,
    attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; OpenStreetMap contributors',
  }),
}

export function getTileConfig(): TileConfig {
  const factory = CONFIGS[provider] ?? CONFIGS.osm
  return factory(apiKey)
}
