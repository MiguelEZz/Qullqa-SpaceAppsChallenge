import { cropName, type ObservationValue } from '@qullqa/shared';
import { compassLabel } from '../field/inclinometer.ts';

const RESIDUE = ['menos del 10 %', 'entre 10 y 50 %', 'más del 50 %'];
const EROSION = ['sin erosión', 'surcos leves', 'cárcavas pequeñas', 'cárcavas o derrumbes'];

export function describeObservation(v: ObservationValue): string {
  switch (v.type) {
    case 'green_cover':
      return `${Math.round(v.fraction * 100)} % de cobertura verde (foto)`;
    case 'residue':
      return `Rastrojo: ${RESIDUE[v.level]}`;
    case 'slope':
      return `Pendiente ${v.slopeDeg.toFixed(1)}°` + (v.aspectDeg != null ? `, baja hacia el ${compassLabel(v.aspectDeg)}` : '');
    case 'phenology':
      return `${cropName(v.crop)}: ${v.stage}` + (v.sowingDate ? ` (sembrado ${v.sowingDate})` : '');
    case 'frost':
      return `Helada ${v.severity}` + (v.minTempC != null ? `, ${v.minTempC} °C` : '') + (v.damagedCrop ? `, dañó ${cropName(v.damagedCrop)}` : '');
    case 'wilting':
      return `Marchitez ${v.severity}` + (v.crop ? ` en ${cropName(v.crop)}` : '');
    case 'soil_moisture':
      return `Prueba del puño: ${v.fistTest}`;
    case 'erosion':
      return EROSION[v.level]!;
    case 'harvest':
      return `${cropName(v.crop)}: ${v.kg} kg en ${v.areaM2} m² (${((v.kg / v.areaM2) * 10).toFixed(1)} t/ha)`;
  }
}
