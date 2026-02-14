export const TRANSMISSION_IMAGE_URL =
  'https://www.ieso.ca/localcontent/ontarioenergymap/img/transmission_02.png';

// Bounds matching IESO's Ontario Energy Map overlay positioning
export const TRANSMISSION_BOUNDS: [[number, number], [number, number]] = [
  [41.9, -95.19],  // southwest
  [56.95, -74.3],  // northeast
];

export interface Intertie {
  name: string;
  path: [number, number][]; // path[0] = Ontario side, path[1] = external side
  flowKey: string; // Maps to IESO IntertieZoneName group
}

// Inter-provincial/international transmission interties from IESO data
export const INTERTIES: Intertie[] = [
  { name: 'Quebec North', path: [[46.37, -79.63], [46.89, -78.39]], flowKey: 'QUEBEC' },
  { name: 'Quebec South (Ottawa) 1', path: [[45.29, -76.96], [45.85, -76.12]], flowKey: 'QUEBEC' },
  { name: 'Quebec South (Ottawa) 2', path: [[45.04, -75.87], [45.82, -75.71]], flowKey: 'QUEBEC' },
  { name: 'New York St. Lawrence', path: [[45.29, -75.15], [44.65, -74.43]], flowKey: 'NEW-YORK' },
  { name: 'New York Niagara', path: [[43.02, -79.67], [43.06, -78.29]], flowKey: 'NEW-YORK' },
  { name: 'Minnesota', path: [[48.78, -91.95], [48.08, -93.14]], flowKey: 'MINNESOTA' },
  { name: 'Manitoba', path: [[49.94, -93.46], [50.02, -96.80]], flowKey: 'MANITOBA' },
  { name: 'Michigan', path: [[42.41, -81.76], [42.33, -83.62]], flowKey: 'MICHIGAN' },
];
