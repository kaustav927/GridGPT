declare module '*.geojson' {
  const value: GeoJSON.FeatureCollection;
  export default value;
}

declare module 'leaflet' {
  export interface PathOptions {
    fillColor?: string;
    fillOpacity?: number;
    color?: string;
    weight?: number;
  }
}
