import type { ParticipantResult, RunResult } from './run.ts';

/**
 * Lo que UN agricultor puede ver de una corrida (ver Privacidad en docs/ARCHITECTURE.md):
 * su propio resultado completo + agregados de la comunidad + el plan (qué se siembra dónde),
 * nunca las monedas, restricciones, utilidades ni compensaciones individuales de otros.
 */
export interface PlanView {
  engineVersion: string;
  valleyVersion: string;
  seed: number;
  disclaimer: string;
  goldenRule: string;
  dataCoverage: RunResult['dataCoverage'];
  participantsCount: number;
  /** null si este agricultor no estaba entre quienes enviaron datos para esa corrida. */
  me: ParticipantResult | null;
  community: {
    plan: { parcelId: string; mine: boolean; rotation: string[]; rotationText: string }[];
    feasible: boolean;
    metrics: RunResult['community']['metrics'];
    mutualBenefit: string[];
    cooperationCurve: RunResult['community']['cooperationCurve'];
    shapleyMethod: RunResult['community']['shapleyMethod'];
    surplus_soles: number;
    /** Cuántas familias reciben / aportan compensación (sin decir quiénes ni cuánto). */
    transfers: { receive: number; give: number; none: number };
    /** Cuántas familias quedan al menos igual que solas. */
    rationalityOkCount: number;
  };
  diagnosis: RunResult['diagnosis'];
  warnings: string[];
}

export function privateView(r: RunResult, userId: string): PlanView {
  const me = r.participants.find((p) => p.userId === userId) ?? null;
  const dir = r.participants.map((p) => p.shapley.ayni.direction);
  return {
    engineVersion: r.engineVersion,
    valleyVersion: r.valleyVersion,
    seed: r.seed,
    disclaimer: r.disclaimer,
    goldenRule: r.goldenRule,
    dataCoverage: r.dataCoverage,
    participantsCount: r.participants.length,
    me,
    community: {
      plan: r.community.plan.map((p) => ({ parcelId: p.parcelId, mine: p.ownerId === userId, rotation: p.rotation, rotationText: p.rotationText })),
      feasible: r.community.feasible,
      metrics: r.community.metrics,
      mutualBenefit: r.community.mutualBenefit,
      cooperationCurve: r.community.cooperationCurve,
      shapleyMethod: r.community.shapleyMethod,
      surplus_soles: r.community.surplus_soles,
      transfers: { receive: dir.filter((d) => d === 'recibe').length, give: dir.filter((d) => d === 'aporta').length, none: dir.filter((d) => d === 'nada').length },
      rationalityOkCount: r.participants.filter((p) => p.rationalityOk).length,
    },
    diagnosis: r.diagnosis,
    warnings: r.warnings,
  };
}
