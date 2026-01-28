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
  { name: 'Quebec North', path: [[46.50, -79.32], [46.76, -78.70]], flowKey: 'QUEBEC' },
  { name: 'Quebec South (Ottawa) 1', path: [[45.43, -76.75], [45.71, -76.33]], flowKey: 'QUEBEC' },
  { name: 'Quebec South (Ottawa) 2', path: [[45.23, -75.83], [45.62, -75.75]], flowKey: 'QUEBEC' },
  { name: 'New York St. Lawrence', path: [[45.13, -74.97], [44.81, -74.61]], flowKey: 'NEW-YORK' },
  { name: 'New York Niagara', path: [[43.03, -79.32], [43.05, -78.63]], flowKey: 'NEW-YORK' },
  { name: 'Minnesota', path: [[48.60, -92.25], [48.25, -92.84]], flowKey: 'MINNESOTA' },
  { name: 'Manitoba', path: [[49.96, -94.29], [50.00, -95.96]], flowKey: 'MANITOBA' },
  { name: 'Michigan', path: [[42.39, -82.22], [42.35, -83.15]], flowKey: 'MICHIGAN' },
];
