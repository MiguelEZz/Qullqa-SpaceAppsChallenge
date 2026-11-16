/**
 * Campañas agrícolas (jul Y → jun Y+1) con El Niño o La Niña de intensidad moderada o fuerte,
 * según el Índice Oceánico El Niño (ONI) de NOAA CPC. Fuente NO NASA (NOAA), usada solo como contraste.
 * https://origin.cpc.ncep.noaa.gov/products/analysis_monitoring/ensostuff/ONI_v5.php
 */
export const ENSO_SOURCE = 'ONI (NOAA Climate Prediction Center) — fuente no NASA, solo para contraste';

export const ELNINO_EVENTS: Record<number, 'El Niño' | 'La Niña'> = {
  1982: 'El Niño', 1986: 'El Niño', 1987: 'El Niño', 1991: 'El Niño', 1994: 'El Niño', 1997: 'El Niño', 2002: 'El Niño', 2009: 'El Niño', 2015: 'El Niño', 2023: 'El Niño',
  1988: 'La Niña', 1995: 'La Niña', 1998: 'La Niña', 1999: 'La Niña', 2007: 'La Niña', 2010: 'La Niña', 2011: 'La Niña', 2020: 'La Niña', 2021: 'La Niña',
};

/** Experimentos naturales que pide la spec §13. */
export const ELNINO_CASES = [2015, 2023];
