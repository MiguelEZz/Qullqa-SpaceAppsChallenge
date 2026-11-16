/**
 * ARCHIVO DE SUPUESTOS EDITABLES (ningún umbral suelto en el código).
 * Todo lo de aquí es 'assumed' salvo que diga lo contrario: se usa para explorar, no es un hecho.
 * El agricultor o el técnico pueden ajustarlos; cada corrida guarda la copia usada en su snapshot.
 */
export interface Assumptions {
  version: string;
  climate: {
    /** Gradiente térmico (°C/m) para llevar la temperatura de la celda POWER a la parcela. */
    lapseRate_Cpm: number;
    /** Altitud de la parcela si no hay GPS ni SRTM (m). */
    defaultElevationM: number;
    /** δ_posición (°C) por hondonada: aire frío. 0 hasta calibrarlo con reportes de helada. */
    deltaPosition_C: number;
    /**
     * La LST nocturna MODIS es temperatura de la SUPERFICIE: en noches despejadas de altura queda ~2–3 °C bajo
     * el aire a 2 m. Se resta del δ estimado con LST para no exagerar las heladas (δ_aire = max(0, δ_LST − esto)).
     */
    lstSkinOffset_C: number;
    /** Lluvia efectiva mínima (mm/día) para contar como «día de lluvia». */
    rainyDay_mm: number;
  };
  soil: {
    /** Número de curva / infiltración: lluvia diaria por encima de esto escurre (mm). */
    runoffThreshold_mm: number;
    /** Fracción de la lluvia sobre el umbral que escurre. */
    runoffFraction: number;
    /** Capa superficial de evaporación para suelo desnudo (mm de agua aprovechable). */
    bareSoilKc: number;
    /** Profundidad del perfil simulado (m): zona radicular + subsuelo. */
    profileDepth_m: number;
  };
  aptitude: {
    /** Fracción de años con helada letal: ≤ marginal → apto; ≤ notApt → marginal; > notApt → no apto. */
    frostMarginal: number;
    frostNotApt: number;
    /** Fracción de años sin terminar los GDD en la ventana. */
    gddMarginal: number;
    gddNotApt: number;
    /** Déficit crónico sin riego: fracción de años con Yrel por agua < 0,5. */
    waterChronicNotApt: number;
    waterMarginal: number;
    /** Margen fuera del rango de altitud (m) que aún se considera marginal. */
    altMarginMarginal_m: number;
    phMin: number;
    phMax: number;
  };
  /** «¿Qué te importa más?» → pesos por indicador (antes de normalizar a 10 monedas). */
  priorities: {
    /** Peso mínimo de cada indicador: nada queda ignorado. */
    base: number;
    /** Puntos que suma cada tarjeta a sus indicadores. */
    cards: Record<'money' | 'safeHarvest' | 'goodLand' | 'animals', Partial<Record<'water' | 'climateRisk' | 'organicMatter' | 'nitrogen' | 'erosion' | 'pestHealth' | 'income' | 'forage', number>>>;
    /** La segunda tarjeta elegida pesa esta fracción de la primera. */
    secondCardShare: number;
    adjust: { livestockSome: number; livestockMany: number; manyLivestock: number; homeConsumptionSafety: number; sellsIncome: number; rainfedWater: number };
  };
  /** Reglas de rotación (práctica agronómica andina; supuesto editable): filtran las rotaciones candidatas. */
  rotation: {
    /** Campañas de descanso permitidas en las 3 planificadas. */
    maxFallowSeasons: number;
    /** Máximo de campañas seguidas con el mismo cultivo (contando la campaña en curso). */
    maxSameCropInRow: number;
    /** Familias que comen de su chacra (autoconsumo o mixto): mínimo de campañas con tubérculo en las 3 (papa «cabeza de rotación»). */
    minTuberSeasonsForHome: number;
    tubers: string[];
  };
  sowing: {
    /** Lluvia acumulada en los últimos 10 días (mm) que abre la siembra en secano. */
    onsetRain10d_mm: number;
    /** Diagnóstico: lluvia mínima en los 20 días siguientes para no contar un «falso inicio» (mm). */
    onsetFollow20d_mm: number;
    /** Tmin ajustada mínima para sembrar (°C). */
    minTmin_C: number;
  };
  damage: {
    /** Pérdida de rendimiento por cada día con helada letal en etapa sensible (fracción). */
    frostPerEvent: number;
    heatPerEvent: number;
    /** Tope de daño acumulado por helada/calor en una temporada. */
    maxDamage: number;
  };
  irrigation: {
    /** Caudal típico de un turno de riego por gravedad (L/s). */
    flow_Ls: number;
    /** Eficiencia de riego por gravedad (fracción que llega a la raíz). */
    efficiency: number;
  };
  organicMatter: {
    /** Fracción de C del residuo que se humifica. */
    humification: number;
    /** Tasa anual de mineralización de la MO (fracción/año). */
    mineralization: number;
    /** Multiplicador de la mineralización por labranza, según familia (tubérculos remueven más el suelo). */
    tillageFactor: Record<string, number>;
    /** Masa de suelo de 0–30 cm (t/ha) para pasar de % a t. */
    soilMass_tha: number;
  };
  erosion: {
    /** Factor P de prácticas (andenes con muro ≈ 0,1–0,3; ladera sin obras = 1). */
    practiceP_terraces: number;
    practiceP_slope: number;
    /** Pendiente por defecto de un andén si no hay medida del celular (°). */
    terraceSlopeDeg: number;
    /** Ancho típico de un andén (longitud de ladera para LS, m). */
    terraceLength_m: number;
    /** Longitud de ladera sin andén (m). */
    slopeLength_m: number;
    /** Pendiente a partir de la cual se asume ladera y no andén (°). */
    terraceMaxSlopeDeg: number;
    /** Factor C del suelo desnudo entre cultivos (con algo de rastrojo). */
    bareC: number;
  };
  pests: {
    /** Factor de riesgo por cada temporada consecutiva de la misma familia. */
    repeatFactor: number;
    /** Riesgo base de una familia sin repetición (0–1). */
    baseRisk: number;
    /** Peso de la fracción de vecinos con la misma familia. */
    neighborWeight: number;
    /** Concentración de hospederos donde el riesgo empieza a subir de forma no lineal (concepto, no medido). */
    percolationThreshold: number;
  };
  market: {
    /** Elasticidad precio de la demanda (ε) para la caída de precio por sobreoferta local. */
    elasticity: number;
    /** Hectáreas de referencia del cultivo en el mercado local (Q0) por comunidad. */
    referenceHa: number;
    /**
     * Autoconsumo: lo que la familia come de su chacra vale lo que se ahorra en comprarlo (precio de tienda),
     * no el precio en chacra. Se aplica a los alimentos básicos según el destino declarado (supuesto).
     */
    homeConsumption: { staples: string[]; priceFactor: Record<'autoconsumo' | 'mixto' | 'feria_local' | 'intermediario', number> };
  };
  /** Umbrales FIJOS de normalización 0–1 (spec §15.11): nunca min-max del conjunto. */
  normalization: {
    deficit_mm_worst: number;
    erosion_tha_worst: number;
    lossProb_worst: number;
    /** Balance de MO (t/ha en 3 temporadas): peor y mejor de referencia. */
    om_tha_worst: number;
    om_tha_best: number;
    nitrogen_kgha_best: number;
    pest_worst: number;
    /** Ingreso: 0 = punto de equilibrio; 1 = mejor margen de referencia en la zona (S/ por ha y campaña). */
    income_best_soles_ha: number;
    income_worst_soles_ha: number;
    forage_kgDMha_best: number;
  };
  labor: {
    /** Jornales por hectárea y campaña según cultivo. */
    daysPerHa: Record<string, number>;
    /** Jornales que aporta cada trabajador de la familia por campaña. */
    daysPerWorker: number;
    /** Multiplicador de capacidad si puede contratar peones o hacer ayni/mink'a. */
    extraLaborFactor: number;
    /** Jornales extra por ha con tracción manual (sin yunta ni tractor). */
    manualExtraDaysPerHa: number;
  };
  money: {
    /** Precio del N en fertilizante (S/ por kg de N) para valorar el crédito de leguminosas. */
    nPrice_soles_kg: number;
    /** Valor de un jornal (S/) para expresar compensaciones en ayni/mink'a. */
    jornal_soles: number;
  };
  community: {
    /** Penalización por cada unidad de utilidad que un participante pierde frente a actuar solo (racionalidad individual). */
    violationPenalty: number;
    lambdaPests: number;
    lambdaWater: number;
    lambdaMarket: number;
    lambdaErosion: number;
    /** Iteraciones del recocido simulado. */
    annealIterations: number;
    annealT0: number;
    /** Límite de parcelas para Shapley exacto (spec: 10). */
    shapleyExactMax: number;
    shapleySamples: number;
  };
  confidence: {
    minYearsHigh: number;
    minNdviGoodFraction: number;
    maxObservationAgeDays: number;
  };
}

export const ASSUMPTIONS: Assumptions = {
  version: '2026-11-14',
  climate: { lapseRate_Cpm: 0.0065, defaultElevationM: 3520, deltaPosition_C: 0, lstSkinOffset_C: 2, rainyDay_mm: 1 },
  soil: { runoffThreshold_mm: 20, runoffFraction: 0.3, bareSoilKc: 0.3, profileDepth_m: 1.5 },
  // Spec §6: umbrales 15 % y 40 %
  aptitude: { frostMarginal: 0.15, frostNotApt: 0.4, gddMarginal: 0.15, gddNotApt: 0.4, waterChronicNotApt: 0.6, waterMarginal: 0.3, altMarginMarginal_m: 200, phMin: 4.5, phMax: 8.5 },
  priorities: {
    base: 0.5,
    cards: {
      money: { income: 4 },
      safeHarvest: { climateRisk: 2.5, water: 1, pestHealth: 0.5 },
      goodLand: { erosion: 1.5, organicMatter: 1.5, nitrogen: 1 },
      animals: { forage: 4 },
    },
    secondCardShare: 0.75,
    adjust: { livestockSome: 0.5, livestockMany: 1, manyLivestock: 10, homeConsumptionSafety: 0.75, sellsIncome: 0.5, rainfedWater: 1 },
  },
  rotation: { maxFallowSeasons: 1, maxSameCropInRow: 2, minTuberSeasonsForHome: 1, tubers: ['papa', 'oca', 'olluco'] },
  sowing: { onsetRain10d_mm: 20, onsetFollow20d_mm: 10, minTmin_C: -2 },
  damage: { frostPerEvent: 0.15, heatPerEvent: 0.05, maxDamage: 0.95 },
  // Caudal de un turno: SUPUESTO (preguntar al comité de regantes / en la app). Eficiencia de riego por gravedad en andenes.
  irrigation: { flow_Ls: 30, efficiency: 0.6 },
  organicMatter: { humification: 0.15, mineralization: 0.02, soilMass_tha: 3900,
    tillageFactor: { Solanaceae: 1.3, Basellaceae: 1.3, Oxalidaceae: 1.3, Fabaceae: 1, Amaranthaceae: 1, Poaceae: 1, ninguna: 0.5 } },
  erosion: { practiceP_terraces: 0.2, practiceP_slope: 1, terraceSlopeDeg: 4, terraceLength_m: 8, slopeLength_m: 30, terraceMaxSlopeDeg: 15, bareC: 0.5 },
  pests: { repeatFactor: 0.35, baseRisk: 0.1, neighborWeight: 0.5, percolationThreshold: 0.6 },
  market: {
    elasticity: 1.5,
    referenceHa: 5,
    // Precio de compra en tienda ≈ 1,6× el de chacra para alimentos básicos (supuesto; confirmar con la feria de Chivay)
    homeConsumption: { staples: ['papa', 'oca', 'olluco', 'haba', 'maiz_amilaceo'], priceFactor: { autoconsumo: 1.6, mixto: 1.3, feria_local: 1, intermediario: 1 } },
  },
  normalization: {
    deficit_mm_worst: 200, // spec §15.11
    erosion_tha_worst: 12, // spec §15.11 (tolerable FAO)
    lossProb_worst: 0.5,
    // 0 = la rotación mantiene la MO; −8 t/ha en 3 campañas = pérdida fuerte (sin contar guano aplicado)
    om_tha_worst: -8, om_tha_best: 0,
    nitrogen_kgha_best: 80,
    pest_worst: 1,
    income_best_soles_ha: 12000, income_worst_soles_ha: 0, // 0 = punto de equilibrio
    forage_kgDMha_best: 8000,
  },
  labor: {
    daysPerHa: { papa: 130, olluco: 110, oca: 110, haba: 70, tarwi: 55, arveja: 70, quinua: 65, cebada: 40, avena_forrajera: 30, maiz_amilaceo: 90, descanso: 0 },
    daysPerWorker: 90, extraLaborFactor: 2, manualExtraDaysPerHa: 15,
  },
  money: { nPrice_soles_kg: 5, jornal_soles: 50 },
  community: { violationPenalty: 5, lambdaPests: 0.5, lambdaWater: 0.5, lambdaMarket: 0.3, lambdaErosion: 0.3, annealIterations: 4000, annealT0: 0.05, shapleyExactMax: 10, shapleySamples: 400 },
  confidence: { minYearsHigh: 20, minNdviGoodFraction: 0.6, maxObservationAgeDays: 120 },
};
