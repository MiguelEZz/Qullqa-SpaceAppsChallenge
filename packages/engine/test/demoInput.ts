import type { EngineInput } from '@qullqa/shared';

/**
 * Comunidad SINTÉTICA para pruebas del motor (no son agricultores reales).
 * Parcelas de ~0,2–0,6 ha sobre los andenes de Chivay/Coporaque (puntos validados con WorldCover).
 */
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ring = ([lon, lat]: [number, number], dx = 0.0004, dy = 0.0003): [number, number][] => [
  [lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy],
];
const parcel = (id: number, name: string, c: [number, number], areaHa: number, alt: number | null, irrigated: boolean, rot: [string, string, string], neighbors: number[], observations: EngineInput['participants'][number]['parcels'][number]['observations'] = []) => ({
  id: uid(id), name, polygon: { type: 'Polygon' as const, coordinates: [ring(c)] }, areaHa, centroid: c, gpsAltitudeM: alt,
  irrigation: irrigated ? { source: 'canal', turnsPerMonth: 3, hoursPerTurn: 3 } : { source: 'none', turnsPerMonth: 0, hoursPerTurn: 0 },
  currentRotation: rot, neighborIds: neighbors.map(uid), observations,
});
const coins = (o: Partial<Record<'water' | 'climateRisk' | 'organicMatter' | 'nitrogen' | 'erosion' | 'pestHealth' | 'income' | 'forage', number>>) => ({
  water: 0, climateRisk: 0, organicMatter: 0, nitrogen: 0, erosion: 0, pestHealth: 0, income: 0, forage: 0, ...o,
});

export const DEMO_INPUT: EngineInput = {
  schemaVersion: 1,
  generatedAt: '2026-11-14T12:00:00.000Z',
  community: { id: uid(1), name: 'Comunidad de prueba (sintética)', center: [-71.62, -15.64] },
  participants: [
    {
      userId: uid(101), submittedAt: '2026-11-14T10:00:00.000Z',
      preferences: { coins: coins({ income: 4, climateRisk: 3, water: 2, pestHealth: 1 }), constraints: { traction: 'yunta', familyWorkers: 3, canGetExtraLabor: true, market: 'feria_local', livestockHeads: 4 }, vetoes: [] },
      parcels: [
        parcel(201, 'Andén grande', [-71.6084, -15.6452], 0.5, 3612, true, ['papa', 'papa', 'haba'], [202, 203], [
          { id: uid(901), value: { type: 'slope', slopeDeg: 5, aspectDeg: 210 }, observedAt: '2026-11-10T09:00:00.000Z', lat: -15.6452, lon: -71.6084, provenance: 'observed' },
          { id: uid(902), value: { type: 'harvest', crop: 'papa', kg: 7000, areaM2: 5000, harvestDate: '2026-05-20' }, observedAt: '2026-05-20T09:00:00.000Z', lat: null, lon: null, provenance: 'observed' },
        ]),
        parcel(202, 'Andén de arriba', [-71.6079, -15.6449], 0.3, 3625, true, ['maiz_amilaceo', 'papa', 'papa'], [201]),
      ],
    },
    {
      userId: uid(102), submittedAt: '2026-11-14T10:05:00.000Z',
      preferences: { coins: coins({ erosion: 3, organicMatter: 3, nitrogen: 2, forage: 2 }), constraints: { traction: 'manual', familyWorkers: 2, canGetExtraLabor: false, market: 'autoconsumo', livestockHeads: 10 }, vetoes: ['olluco'] },
      parcels: [
        parcel(203, 'Chacra del medio', [-71.6090, -15.6455], 0.4, 3605, true, ['papa', 'cebada', 'papa'], [201, 204], [
          { id: uid(903), value: { type: 'soil_moisture', fistTest: 'seco' }, observedAt: '2026-11-12T08:00:00.000Z', lat: null, lon: null, provenance: 'observed' },
        ]),
        parcel(204, 'Ladera', [-71.6096, -15.6460], 0.25, null, false, ['quinua', 'cebada', 'descanso'], [203]),
      ],
    },
    {
      userId: uid(103), submittedAt: '2026-11-14T10:10:00.000Z',
      preferences: { coins: coins({ income: 6, water: 2, pestHealth: 2 }), constraints: { traction: 'tractor', familyWorkers: 1, canGetExtraLabor: true, market: 'intermediario', livestockHeads: 0 }, vetoes: [] },
      parcels: [
        parcel(205, 'Coporaque 1', [-71.6476, -15.6308], 0.6, 3548, true, ['papa', 'haba', 'papa'], [206]),
        parcel(206, 'Coporaque 2', [-71.6481, -15.6311], 0.35, 3541, true, ['haba', 'papa', 'papa'], [205]),
      ],
    },
  ],
};
