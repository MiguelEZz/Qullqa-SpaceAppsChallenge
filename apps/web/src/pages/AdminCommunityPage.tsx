import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { RunResult } from '@qullqa/engine';
import { FOCUS_CARDS, INDICATORS, cropName, type LonLat } from '@qullqa/shared';
import { api } from '../api.ts';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { Card, ErrorMsg, Loading, Page } from '../components/ui.tsx';
import { MapView } from '../components/MapView.tsx';
import { BarList, CROP_GROUPS, Columns, Funnel, Legend, LineChart, RISK_METRICS, StackedRows, Stat, groupOf, riskColor, riskLegend, type RiskMetric } from '../components/charts.tsx';
import { ConfidenceCard, funnelSteps, type ConfidenceData, type FunnelData } from './AdminPage.tsx';
import { PlanResult } from './PlanPage.tsx';
import type { PlanView } from '@qullqa/engine';

type Risk = { lossProb: number; deficitMm: number; erosionTha: number; incomeHa: number; pest: number };

interface Detail {
  history: { id: string; kind: 'community' | 'incremental' | 'personal'; date: string; families: number; parcels: number; hectares: number; nowByCrop: Record<string, number>; planByCrop: Record<string, number> }[];
  funnel: FunnelData;
  risk: { parcelId: string; family: number; current: Risk; plan: Risk | null }[];
  confidence: ConfidenceData | null;
  community: { id: string; name: string; district: string | null; province: string | null; isDemo: boolean; hasValleyData: boolean; center: LonLat; altitudeM: number | null };
  members: number;
  submitted: number;
  demoMembers: { userId: string; name: string; family: number }[];
  parcels: { id: string; family: number; ring: LonLat[]; areaHa: number; altitudeM: number | null; irrigation: string; rotation: string[] }[];
  priorities: { n: number; avgCoins: Record<string, number> | null; minGroup: number; focusCounts: Record<string, number> | null };
  resources: { traction: Record<string, number>; market: Record<string, number>; livestock: number; workers: number } | null;
  observations: {
    byType: Record<string, number>;
    frosts: { date: string; severity: string; minTempC: number | null; crop: string | null; altitudeM: number | null }[];
    harvests: { date: string; crop: string; kgHa: number; altitudeM: number | null }[];
    soilMoisture: Record<string, number>;
    erosion: Record<string, number>;
    byMonth: Record<string, number>;
  };
  run: null | {
    id: string; finishedAt: string; durationMs: number; participants: number; feasible: boolean; surplus: number; shapleyMethod: string;
    metrics: RunResult['community']['metrics']; mutualBenefit: string[]; cooperationCurve: RunResult['community']['cooperationCurve'];
    plan: { parcelId: string; family: number; rotation: string[]; rotationText: string }[];
    families: { family: number; utilityCurrent: number; utilitySolo: number; utilityCommunity: number; rationalityOk: boolean; transfer: number; ayni: { soles: number; jornales: number; direction: string }; confidence: string }[];
    diagnosis: RunResult['diagnosis'];
    dataCoverage: RunResult['dataCoverage'];
    warnings: string[];
  };
}

const fmt = (n: number, d = 0) => n.toLocaleString('es-PE', { maximumFractionDigits: d });
const pct = (n: number) => `${Math.round(n * 100)} %`;
const IRR: Record<string, string> = { none: 'secano', canal: 'canal', spring: 'manantial', well: 'pozo', reservoir: 'reservorio' };

type MapMode = 'hoy' | 'plan' | 'riesgo';

export function AdminCommunityPage() {
  const { id = '' } = useParams();
  const d = useApi<Detail>(`/admin/communities/${id}`);
  const { refresh } = useSession();
  const nav = useNavigate();
  const [mode, setMode] = useState<MapMode>('plan');
  const [metric, setMetric] = useState<RiskMetric>('lossProb');
  const [riskOf, setRiskOf] = useState<'current' | 'plan'>('current');
  const [screen, setScreen] = useState<{ name: string; view: PlanView } | null>(null);
  const [screenBusy, setScreenBusy] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const data = d.data;

  const planByParcel = useMemo(() => new Map(data?.run?.plan.map((p) => [p.parcelId, p]) ?? []), [data?.run]);

  async function recalc() {
    setBusy(true);
    setError(null);
    try {
      const before = data?.run?.id;
      await api(`/admin/communities/${id}/run`, { method: 'POST' });
      setWaiting(true);
      const poll = async () => {
        const r = await api<Detail>(`/admin/communities/${id}`);
        if (r.run?.id !== before) { d.setData(r); setWaiting(false); } else setTimeout(poll, 2500);
      };
      setTimeout(poll, 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function showScreen(userId: string) {
    setScreenBusy(userId);
    setError(null);
    try {
      const r = await api<{ name: string; latest: { view: PlanView } | null }>(`/admin/communities/${id}/view/${userId}`);
      if (!r.latest) throw new Error('Esta comunidad todavía no tiene un plan calculado.');
      setScreen({ name: r.name, view: r.latest.view });
      setTimeout(() => document.getElementById('pantalla')?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScreenBusy(null);
    }
  }

  async function actAs(userId: string) {
    try {
      const r = await api<{ communityId: string | null }>(`/admin/act-as/${userId}`, { method: 'POST' });
      await refresh();
      nav(r.communityId ? `/c/${r.communityId}/plan` : '/');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (d.error) return <Page title="Comunidad" back="/admin"><ErrorMsg error={d.error} /></Page>;
  if (!data) return <Page title="Comunidad" back="/admin"><Loading /></Page>;
  const { community: c, parcels, run, observations: obs } = data;
  const totalHa = parcels.reduce((s, p) => s + p.areaHa, 0);
  const selected = parcels.find((p) => p.id === sel);

  const riskByParcel = new Map(data.risk.map((r) => [r.parcelId, r]));
  const mapParcels = parcels.map((p) => {
    if (mode === 'riesgo') {
      const r = riskByParcel.get(p.id);
      const v = r ? (riskOf === 'plan' && r.plan ? r.plan : r.current)[metric] : null;
      return { id: p.id, ring: p.ring, mine: false, color: v === null ? '#8c857d' : riskColor(metric, v), selected: p.id === sel };
    }
    const crop = mode === 'plan' ? planByParcel.get(p.id)?.rotation[0] ?? p.rotation[2]! : p.rotation[2]!;
    return { id: p.id, ring: p.ring, mine: false, color: groupOf(crop).color, selected: p.id === sel };
  });
  const topRisk = [...data.risk].sort((a, b) => b.current[metric] - a.current[metric]).slice(0, 5);
  // Hectáreas por cultivo: campaña en curso vs año 1 del plan
  const shift = new Map<string, number>();
  if (run) for (const p of parcels) {
    shift.set(p.rotation[2]!, (shift.get(p.rotation[2]!) ?? 0) - p.areaHa);
    const pl = planByParcel.get(p.id)?.rotation[0];
    if (pl) shift.set(pl, (shift.get(pl) ?? 0) + p.areaHa);
  }
  const shiftRows = [...shift.entries()].filter(([, v]) => Math.abs(v) > 0.005).sort((a, b) => b[1] - a[1]);

  // Mezcla de cultivos por campaña (ha por grupo): 3 registradas + 3 del plan
  const mixRow = (label: string, crops: { crop: string; ha: number }[]) => ({
    label,
    parts: CROP_GROUPS.map((g) => ({ key: g.id, name: g.label, color: g.color, value: crops.filter((x) => groupOf(x.crop).id === g.id).reduce((s, x) => s + x.ha, 0) })),
  });
  const mix = [
    ...[0, 1, 2].map((k) => mixRow(['Hace 2 campañas', 'Campaña pasada', 'Campaña en curso'][k]!, parcels.map((p) => ({ crop: p.rotation[k]!, ha: p.areaHa })))),
    ...(run ? [0, 1, 2].map((k) => mixRow(`Plan, año ${k + 1}`, parcels.map((p) => ({ crop: planByParcel.get(p.id)?.rotation[k] ?? 'descanso', ha: p.areaHa })))) : []),
  ];

  const dg = run?.diagnosis;
  const m = run?.metrics;

  return (
    <Page title={c.name} back="/admin">
      <p className="lead">
        {c.isDemo && <span className="badge gray">demo · datos sintéticos</span>} {c.district && `Distrito de ${c.district}, ${c.province}`}{c.altitudeM ? ` · ~${fmt(c.altitudeM)} m` : ''}
      </p>

      <div className="stats-grid">
        <Stat label="familias" value={data.members} />
        <Stat label="enviaron datos" value={data.submitted} />
        <Stat label="parcelas" value={parcels.length} />
        <Stat label="hectáreas" value={fmt(totalHa, 1)} />
      </div>

      <Card title="Dónde se queda la gente">
        <Funnel steps={funnelSteps(data.funnel)} />
      </Card>

      <ErrorMsg error={error} />
      {c.hasValleyData && <button onClick={recalc} disabled={busy || waiting}>{waiting ? 'Calculando… (unos segundos)' : 'Recalcular el plan ahora'}</button>}

      <Card title="Mapa de parcelas">
        <div className="tabs" role="tablist">
          <button role="tab" className={mode === 'hoy' ? 'on' : ''} aria-selected={mode === 'hoy'} onClick={() => setMode('hoy')}>Lo que siembran hoy</button>
          <button role="tab" className={mode === 'plan' ? 'on' : ''} aria-selected={mode === 'plan'} onClick={() => setMode('plan')} disabled={!run}>Plan (año 1)</button>
          <button role="tab" className={mode === 'riesgo' ? 'on' : ''} aria-selected={mode === 'riesgo'} onClick={() => setMode('riesgo')} disabled={!run}>Riesgo</button>
        </div>
        {mode === 'riesgo' && (
          <div className="select">
            {(Object.keys(RISK_METRICS) as RiskMetric[]).map((k) => (
              <button key={k} className={`chip ${metric === k ? 'on' : ''}`} onClick={() => setMetric(k)}>{RISK_METRICS[k].label}</button>
            ))}
            <button className="chip" onClick={() => setRiskOf(riskOf === 'current' ? 'plan' : 'current')}>{riskOf === 'current' ? 'Con lo de hoy' : 'Con el plan'} ⇄</button>
          </div>
        )}
        <MapView center={c.center} parcels={mapParcels} fitTo={parcels.flatMap((p) => p.ring)} onParcelClick={setSel} height="340px" />
        {mode === 'riesgo'
          ? <Legend items={riskLegend(metric)} />
          : <Legend items={CROP_GROUPS.map((g) => ({ label: g.label, color: g.color }))} />}
        {selected ? (
          <div className="notice green small">
            <strong>Familia {selected.family}</strong> · {fmt(selected.areaHa, 2)} ha · {selected.altitudeM ? `${fmt(selected.altitudeM)} m` : 'altura s/d'} · riego: {IRR[selected.irrigation] ?? selected.irrigation}
            <br />Registró: {selected.rotation.map(cropName).join(' → ')}
            {planByParcel.get(selected.id) && <><br />Plan: {planByParcel.get(selected.id)!.rotationText}</>}
            {riskByParcel.get(selected.id) && <><br />Riesgo hoy (simulado): pérdida {RISK_METRICS.lossProb.fmt(riskByParcel.get(selected.id)!.current.lossProb)} · falta de agua {RISK_METRICS.deficitMm.fmt(riskByParcel.get(selected.id)!.current.deficitMm)} · erosión {RISK_METRICS.erosionTha.fmt(riskByParcel.get(selected.id)!.current.erosionTha)}</>}
          </div>
        ) : <p className="small muted">Toca una parcela para ver su detalle.</p>}
      </Card>

      {run && data.risk.length > 0 && (
        <Card title={`Dónde ir primero: ${RISK_METRICS[metric].label.toLowerCase()}`}>
          <p className="small muted">Las 5 parcelas con más riesgo simulado con lo que siembran hoy, y cómo quedarían con el plan. Cambia el tema en la pestaña «Riesgo» del mapa.</p>
          <table className="table">
            <thead><tr><th>Parcela</th><th>Hoy</th><th>Con el plan</th></tr></thead>
            <tbody>
              {topRisk.map((r) => {
                const p = parcels.find((x) => x.id === r.parcelId);
                return (
                  <tr key={r.parcelId} onClick={() => { setSel(r.parcelId); setMode('riesgo'); }} style={{ cursor: 'pointer' }}>
                    <td>Familia {r.family}{p?.altitudeM ? ` · ${fmt(p.altitudeM)} m` : ''}</td>
                    <td>{RISK_METRICS[metric].fmt(r.current[metric])}</td>
                    <td><strong>{r.plan ? RISK_METRICS[metric].fmt(r.plan[metric]) : '—'}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {shiftRows.length > 0 && (
        <Card title="Si siguen el plan: hectáreas que suben y bajan">
          <BarList rows={shiftRows.map(([crop, v]) => ({ label: `${v > 0 ? '▲' : '▼'} ${cropName(crop)}`, value: Math.abs(v), color: v > 0 ? 'var(--green)' : 'var(--bad)', hint: `${cropName(crop)}: ${v > 0 ? '+' : '−'}${fmt(Math.abs(v), 2)} ha` }))} unit="ha" digits={2} />
          <p className="small muted">Campaña en curso frente al primer año del plan coordinado. Sirve para prever semilla, mercado y asistencia técnica.</p>
        </Card>
      )}

      <Card title="Mezcla de cultivos por campaña (ha)">
        <StackedRows rows={mix} />
        <Legend items={CROP_GROUPS.map((g) => ({ label: g.label, color: g.color }))} />
        <p className="small muted">Si una franja domina (por ejemplo, todo papa), hay más riesgo de plagas compartidas y de que baje el precio en la feria.</p>
      </Card>

      {run && m && (
        <Card title="Lo que cambia al coordinar">
          <p className="small muted">Plan calculado el {new Date(run.finishedAt).toLocaleString('es-PE')} en {fmt(run.durationMs / 1000, 1)} s con {run.participants} familias · Shapley {run.shapleyMethod === 'exact' ? 'exacto' : 'por muestreo'}{run.feasible ? '' : ' · Atención: no se encontró un plan que deje a todos igual o mejor'}</p>
          <table className="table">
            <thead><tr><th></th><th>Hoy</th><th>Cada uno solo</th><th>Coordinado</th></tr></thead>
            <tbody>
              <tr><td>Riesgo de plagas</td><td>{pct(m.current.meanPestRisk)}</td><td>{pct(m.allSolo.meanPestRisk)}</td><td><strong>{pct(m.community.meanPestRisk)}</strong></td></tr>
              <tr><td>Pico de riego (m³/década)</td><td>{fmt(m.current.waterPeak_m3)}</td><td>{fmt(m.allSolo.waterPeak_m3)}</td><td><strong>{fmt(m.community.waterPeak_m3)}</strong></td></tr>
              <tr><td>Caída de precio</td><td>{pct(m.current.meanPriceDrop)}</td><td>{pct(m.allSolo.meanPriceDrop)}</td><td><strong>{pct(m.community.meanPriceDrop)}</strong></td></tr>
              <tr><td>Suelo que baja (t/año)</td><td>{fmt(m.current.downstreamErosion_t, 1)}</td><td>{fmt(m.allSolo.downstreamErosion_t, 1)}</td><td><strong>{fmt(m.community.downstreamErosion_t, 1)}</strong></td></tr>
              <tr><td>Prob. de ruina</td><td>{pct(m.current.ruinProb)}</td><td>{pct(m.allSolo.ruinProb)}</td><td><strong>{pct(m.community.ruinProb)}</strong></td></tr>
              <tr><td>Dinero total (S/ por campaña)</td><td>{fmt(m.current.totalMoney)}</td><td>{fmt(m.allSolo.totalMoney)}</td><td><strong>{fmt(m.community.totalMoney)}</strong></td></tr>
            </tbody>
          </table>
          <ul className="bullets small">{run.mutualBenefit.map((t) => <li key={t}>{t}</li>)}</ul>
          {run.cooperationCurve.length > 1 && (
            <>
              <h3>Curva de cooperación: riesgo de plagas según cuántas familias se suman</h3>
              <LineChart points={run.cooperationCurve.map((p) => p.pestRisk * 100)} xLabels={run.cooperationCurve.map((p) => `${Math.round(p.cooperation * 100)} %`)} unit="% de riesgo" color="var(--brick)" />
            </>
          )}
        </Card>
      )}

      {run && (
        <Card title="Cada familia (anónima)">
          <table className="table">
            <thead><tr><th>Familia</th><th title="Puntaje 0–100 según sus propias prioridades">Hoy</th><th>Solo</th><th>Coord.</th><th>Ayni</th><th>Conf.</th></tr></thead>
            <tbody>
              {run.families.map((f) => (
                <tr key={f.family}>
                  <td>{f.family}</td>
                  <td>{Math.round(f.utilityCurrent * 100)}</td>
                  <td>{Math.round(f.utilitySolo * 100)}</td>
                  <td><strong>{Math.round(f.utilityCommunity * 100)}</strong>{f.rationalityOk ? '' : <span title="Queda peor que solo" className="warn-mark"> !</span>}</td>
                  <td>{f.ayni.direction === 'nada' ? '—' : `${f.ayni.direction === 'recibe' ? '+' : '−'}${fmt(f.ayni.jornales, 1)} j`}</td>
                  <td>{f.confidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Puntajes según las 10 monedas de cada familia. «Ayni» en jornales: + recibe, − aporta. Excedente total: S/ {fmt(run.surplus)} por campaña.</p>
        </Card>
      )}

      {data.demoMembers.length > 0 && (
        <Card title="Lo que ve cada familia en su celular">
          <p className="small muted">Toca una familia demo para ver su pantalla de resultados aquí mismo. «Entrar como» abre la app completa con su cuenta (12 h).</p>
          <div className="chips">
            {data.demoMembers.map((u) => (
              <button key={u.userId} className={`chip ${screen?.name === u.name ? 'on' : ''}`} onClick={() => void showScreen(u.userId)} disabled={screenBusy === u.userId}>
                {u.family}. {u.name.replace(' (demo)', '').replace('Familia ', '')}
              </button>
            ))}
          </div>
          {screen && (
            <div id="pantalla">
              <h3>Pantalla de {screen.name.replace(' (demo)', '')} · Plan de siembra</h3>
              <div className="phone"><PlanResult view={screen.view} /></div>
              <button className="secondary" onClick={() => void actAs(data.demoMembers.find((m) => m.name === screen.name)!.userId)}>Entrar como esta familia (app completa)</button>
            </div>
          )}
        </Card>
      )}

      {data.confidence && <ConfidenceCard c={data.confidence} />}

      <Card title="Qué le importa a la comunidad">
        {data.priorities.focusCounts && (
          <>
            <h3 style={{ marginTop: 0 }}>Lo que eligieron («¿Qué te importa más?»)</h3>
            <BarList rows={FOCUS_CARDS.map((f) => ({ label: f.label, value: data.priorities.focusCounts![f.id] ?? 0 }))} unit="familias" color="var(--brick)" />
            <h3>Cómo se traduce para el cálculo</h3>
          </>
        )}
        {data.priorities.avgCoins ? (
          <BarList rows={INDICATORS.map((i) => ({ label: i.label, value: data.priorities.avgCoins![i.id] ?? 0, hint: i.hint }))} unit="monedas" digits={1} />
        ) : <p className="small muted">Se muestra cuando al menos {data.priorities.minGroup} familias guardaron sus prioridades (hoy: {data.priorities.n}), para que nadie pueda ser identificado.</p>}
        {data.resources && (
          <p className="small">
            Tracción: {Object.entries(data.resources.traction).map(([k, v]) => `${k} ${v}`).join(', ')} · Destino: {Object.entries(data.resources.market).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')} · {data.resources.workers} personas trabajando · {data.resources.livestock} animales
          </p>
        )}
      </Card>

      <Card title="Lo que observan en el campo">
        {Object.keys(obs.byType).length === 0 && <p className="muted small">Aún no hay observaciones.</p>}
        {obs.frosts.length > 0 && (
          <>
            <h3>Heladas reportadas ({obs.frosts.length})</h3>
            <ul className="bullets small">
              {obs.frosts.map((f, i) => <li key={i}>{new Date(f.date).toLocaleDateString('es-PE', { dateStyle: 'medium' })}: helada {f.severity}{f.minTempC != null ? ` (${f.minTempC} °C)` : ''}{f.crop ? ` en ${cropName(f.crop)}` : ''}{f.altitudeM ? ` · ${fmt(f.altitudeM)} m` : ''}</li>)}
            </ul>
          </>
        )}
        {obs.harvests.length > 0 && (
          <>
            <h3>Cosechas registradas (kg/ha)</h3>
            <BarList rows={obs.harvests.map((h) => ({ label: `${cropName(h.crop)}${h.altitudeM ? ` · ${fmt(h.altitudeM)} m` : ''}`, value: h.kgHa, color: groupOf(h.crop).color }))} unit="kg/ha" />
          </>
        )}
        {Object.keys(obs.soilMoisture).length > 0 && <p className="small">Prueba del puño: {Object.entries(obs.soilMoisture).map(([k, v]) => `${k} ${v}`).join(', ')}</p>}
        {Object.keys(obs.erosion).length > 0 && <p className="small">Erosión observada (nivel 0–3): {Object.entries(obs.erosion).map(([k, v]) => `nivel ${k}: ${v}`).join(', ')}</p>}
      </Card>

      {dg && (
        <Card title={`El clima del valle (${dg.profiles.length} campañas, NASA POWER + GPM IMERG)`}>
          <h3>Lluvia por campaña (mm)</h3>
          <Columns
            data={dg.profiles.map((p) => ({ label: p.label.slice(2, 4), value: p.totalRain, mark: p.enso === 'El Niño', hint: `${p.label}: ${fmt(p.totalRain)} mm · lluvias desde ${p.rainOnsetLabel}${p.enso ? ` · ${p.enso}` : ''}` }))}
            unit="mm" color="var(--green)" labelEvery={5} refLine={{ value: dg.profiles.reduce((s, p) => s + p.totalRain, 0) / dg.profiles.length, label: 'promedio' }}
          />
          <Legend items={[{ label: 'Campaña normal', color: 'var(--green)' }, { label: 'Año El Niño (NOAA, no NASA)', color: 'var(--green)', pattern: true }]} />
          <h3>Décadas con helada por campaña (oct–abr)</h3>
          <Columns data={dg.profiles.map((p) => ({ label: p.label.slice(2, 4), value: p.frostDecades, hint: `${p.label}: ${p.frostDecades} décadas con helada, ${p.lateFrostDays} heladas tardías` }))} unit="décadas" color="var(--brick)" labelEvery={5} height={120} />
          <h3>Lluvia típica por década del año (mediana y rango p10–p90)</h3>
          <LineChart points={dg.climatology.map((x) => x.rain_mm.median)} band={dg.climatology.map((x) => [x.rain_mm.p10, x.rain_mm.p90])} xLabels={dg.climatology.map((x) => x.label)} unit="mm por década" />
          <h3>Tendencias</h3>
          <ul className="bullets small">{dg.trends.map((t) => <li key={t.variable}>{t.text}</li>)}</ul>
          <h3>Tipos de año</h3>
          <ul className="bullets small">
            {dg.yearTypes.types.map((t) => <li key={t.name}><strong>{t.name}</strong>: {t.count} campañas (lluvia media {fmt(t.meanRain)} mm{t.elNino ? `, ${t.elNino} El Niño` : ''}) — {t.years.slice(-4).join(', ')}{t.years.length > 4 ? '…' : ''}</li>)}
          </ul>
          <p className="small muted">Altura de referencia {fmt(dg.elevationM)} m. Son estimaciones de reanálisis y satélite: confirmar tendencias con estaciones.</p>
        </Card>
      )}

      {data.history.length > 0 && (
        <Card title="Historia de la comunidad" icon="clock">
          <p className="small muted">Cada cálculo guarda una copia fija de los datos de ese momento. Así se ve cómo cambia la comunidad con el tiempo.</p>
          <table className="table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Familias</th><th>ha</th></tr></thead>
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.date).toLocaleDateString('es-PE', { dateStyle: 'medium' })}</td>
                  <td>{h.kind === 'community' ? 'Comunidad' : h.kind === 'incremental' ? 'Se sumó alguien' : 'Personal'}</td>
                  <td>{h.families}</td>
                  <td>{fmt(h.hectares, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Qué sembraban y qué recomendó el plan en cada cálculo (ha)</h3>
          <StackedRows rows={[...data.history].reverse().flatMap((h) => {
            const d = new Date(h.date).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
            const parts = (m: Record<string, number>) => CROP_GROUPS.map((g) => ({ key: g.id, name: g.label, color: g.color, value: Object.entries(m).filter(([c]) => groupOf(c).id === g.id).reduce((x, [, v]) => x + v, 0) }));
            return [{ label: `${d} · hoy`, parts: parts(h.nowByCrop) }, { label: `${d} · plan`, parts: parts(h.planByCrop) }];
          })} />
          <Legend items={CROP_GROUPS.map((g) => ({ label: g.label, color: g.color }))} />
        </Card>
      )}

      <Card title="Descargar los datos de esta comunidad (CSV)">
        <div className="downloads">
          <a className="btn secondary" href={`/api/admin/export/parcels.csv?community=${c.id}`} download>Parcelas</a>
          <a className="btn secondary" href={`/api/admin/export/observations.csv?community=${c.id}`} download>Observaciones</a>
        </div>
      </Card>

      {run && (
        <Card title="Fuentes">
          <ul className="bullets small">
            {run.dataCoverage.map((s) => <li key={s.id}><strong>{s.product}</strong> {s.isNasa ? <span className="badge green">NASA</span> : <span className="badge gray">no NASA</span>} — {s.coverage}</li>)}
          </ul>
          {run.warnings.length > 0 && <ul className="bullets small muted">{run.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        </Card>
      )}
    </Page>
  );
}
