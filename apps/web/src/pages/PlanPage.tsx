import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { IndicatorValue, PlanView, StrategyCard } from '@qullqa/engine';
import { INDICATORS, cropName, type IndicatorId, type Provenance } from '@qullqa/shared';
import { useApi } from '../lib/hooks.ts';
import { Card, ErrorMsg, LinkButton, Loading, Page } from '../components/ui.tsx';
import { WaitingCard } from '../components/Waiting.tsx';
import { Icon } from '../components/Icon.tsx';

/** Respuesta de GET /api/communities/:id/plan (apps/api/src/routes/runs.ts). */
export interface PlanResponse {
  hasValleyData: boolean;
  submittedCount: number;
  memberCount: number;
  pending: { id: string; status: 'queued' | 'running'; createdAt: string } | null;
  latest: { id: string; kind: 'community' | 'incremental' | 'personal'; createdAt: string; finishedAt: string; durationMs: number; view: PlanView } | null;
  /** Envió sus datos y espera a sus vecinos; personalPlanAt = cuándo llega su plan personal si nadie más envía. */
  waiting: { since: string; personalPlanAt: string; othersSubmitted: number } | null;
  lastError: string | null;
}

type Sid = 'community' | 'individual' | 'current';
const TABS: { id: Sid; label: string }[] = [
  { id: 'community', label: 'Con mis vecinos' },
  { id: 'individual', label: 'Yo solo' },
  { id: 'current', label: 'Lo de hoy' },
];

export const PROVENANCE_LABEL: Record<Provenance, { text: string; hint: string }> = {
  observed: { text: 'medido', hint: 'Dato medido o registrado en el campo.' },
  estimated: { text: 'estimado', hint: 'Viene de un satélite o de un modelo (por ejemplo NASA POWER o SoilGrids).' },
  simulated: { text: 'simulado', hint: 'Lo calcula el motor de Qullqa con el clima de años pasados. No es una predicción comprobada.' },
  assumed: { text: 'supuesto', hint: 'Valor sin evidencia suficiente para tu comunidad; sirve para explorar.' },
};

const fmt = (n: number, d = 0) => n.toLocaleString('es-PE', { maximumFractionDigits: d, minimumFractionDigits: d });
const date = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

/** Texto corto del valor de un indicador, en su unidad. */
function valueText(id: IndicatorId, v: IndicatorValue): string {
  switch (id) {
    case 'water': return `${fmt(v.mean)} mm de falta de agua por campaña`;
    case 'climateRisk': return `${fmt(v.mean * 100)} % de campañas con pérdida`;
    case 'organicMatter': return `${v.mean >= 0 ? '+' : ''}${fmt(v.mean, 1)} t/ha de materia orgánica en 3 campañas`;
    case 'nitrogen': return v.range ? `${fmt(v.range[0])}–${fmt(v.range[1])} kg N/ha (supuesto)` : `${fmt(v.mean)} kg N/ha`;
    case 'erosion': return `${fmt(v.mean, 1)} t/ha de suelo perdido al año`;
    case 'pestHealth': return `riesgo de plagas ${fmt(v.mean * 100)} de 100`;
    case 'income': return `S/ ${fmt(v.mean)} por ha y campaña`;
    case 'forage': return `${fmt(v.mean)} kg de forraje seco por ha`;
  }
}

function Indicators({ card, compare }: { card: StrategyCard; compare?: StrategyCard }) {
  return (
    <ul className="indicators">
      {INDICATORS.map(({ id, label, hint }) => {
        const v = card.indicators[id];
        const base = compare?.indicators[id];
        const delta = base ? v.score - base.score : 0;
        const p = PROVENANCE_LABEL[v.provenance];
        return (
          <li key={id}>
            <div className="ind-head">
              <strong title={hint}>{label}</strong>
              <span className={`badge ${v.provenance === 'assumed' ? 'gray' : ''}`} title={p.hint}>{p.text}</span>
              {base && Math.abs(delta) >= 0.04 && <span className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '▲ mejor' : '▼ peor'}</span>}
            </div>
            <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v.score * 100)} aria-label={`${label}: ${Math.round(v.score * 100)} de 100`}>
              <span style={{ width: `${Math.max(2, v.score * 100)}%` }} />
            </div>
            <small>{valueText(id, v)}</small>
          </li>
        );
      })}
    </ul>
  );
}

function Rotation({ card }: { card: StrategyCard }) {
  return (
    <>
      {card.parcels.map((p) => (
        <div key={p.parcelId} className="rotation">
          <h3>{p.parcelName}</h3>
          <ol>
            {p.rotation.map((r) => (
              <li key={r.campaign}>
                <span className="camp">{r.campaign}</span>
                <strong>{r.cropName}</strong>
                {r.sowing && <small>Siembra típica: {r.sowing}{r.harvest ? ` · cosecha: ${r.harvest}` : ''}</small>}
              </li>
            ))}
          </ol>
          <p className="small muted">
            En {p.years} campañas simuladas, {p.failYears === 0 ? 'ninguna tuvo' : `${p.failYears} tuvieron`} pérdida fuerte (menos de la mitad de la cosecha).
          </p>
        </div>
      ))}
    </>
  );
}

function Bullets({ title, items, className = '' }: { title: string; items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul className={`bullets ${className}`}>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </>
  );
}

function StrategyView({ card, current, utilitySolo }: { card: StrategyCard; current?: StrategyCard; utilitySolo: number }) {
  const conf = card.confidence;
  return (
    <>
      <Card title={card.title}>
        <p className="score">
          <span className="big">{Math.round(card.utility * 100)}</span>
          <span>
            de 100 según <strong>tus prioridades</strong>
            {card.strategy === 'community' && <small>Tu mejor plan solo: {Math.round(utilitySolo * 100)} de 100</small>}
          </span>
        </p>
        <Rotation card={card} />
      </Card>

      <Card title="Cómo le va en cada tema">
        <Indicators card={card} compare={card.strategy === 'current' ? undefined : current} />
        <p className="small muted">La barra es el puntaje de 0 a 100 con umbrales fijos (no comparado con tus vecinos). Toca la etiqueta para ver de dónde viene el dato.</p>
      </Card>

      <Card title="Por qué y con qué datos">
        <Bullets title="Por qué" items={card.why} />
        <Bullets title="Beneficios" items={card.benefits} className="good" />
        <Bullets title="Riesgos que conviene revisar en tu chacra" items={card.risks} className="warn" />
        <Bullets title="Evidencia" items={card.evidence} />
        <h3>Confianza: <span className={`badge ${conf.level === 'alta' ? 'green' : conf.level === 'baja' ? '' : 'gray'}`}>{conf.level}</span></h3>
        <Bullets title="Lo que ya tenemos" items={conf.met} className="good" />
        <Bullets title="Para subir la confianza falta" items={[...conf.missing, ...card.missing]} />
      </Card>
    </>
  );
}

export function PlanPage() {
  const { cid = '' } = useParams();
  const plan = useApi<PlanResponse>(`/communities/${cid}/plan`);
  const d = plan.data;

  // Mientras el cerebro calcula, consultamos cada 2 s
  useEffect(() => {
    if (!d?.pending) return;
    const t = setInterval(() => void plan.reload(), 2000);
    return () => clearInterval(t);
  }, [d?.pending, plan]);

  if (plan.error) return <Page title="Plan de siembra" back="/"><ErrorMsg error={plan.error} /></Page>;
  if (!d) return <Page title="Plan de siembra" back="/"><Loading /></Page>;

  const v = d.latest?.view;

  return (
    <Page title="Plan de siembra" back="/">
      {!d.hasValleyData && <p className="notice">Todavía no tenemos los datos NASA de esta zona. Tu plan se calculará cuando el valle esté listo.</p>}

      {d.pending && (
        <div className="notice green status">
          <span className="spinner" aria-hidden /> Calculando tu plan con los datos de tu comunidad…
          <small>Simulamos cada rotación posible con 44 años de clima. Tarda unos segundos.</small>
        </div>
      )}
      {d.lastError && !d.pending && <p className="notice">{d.lastError}</p>}

      {d.waiting && <WaitingCard personalPlanAt={d.waiting.personalPlanAt} othersSubmitted={d.waiting.othersSubmitted} memberCount={d.memberCount} cid={cid} />}

      {!d.latest && !d.pending && !d.waiting && d.hasValleyData && (
        <Card title="Todavía no tienes plan" icon="sprout">
          <p>Tu plan se calcula solo cuando envías tus datos. Sigue los pasos del inicio.</p>
          <LinkButton to="/" icon="home">IR AL INICIO</LinkButton>
        </Card>
      )}

      {d.latest && (
        <p className="lead small">
          {d.latest.kind === 'personal'
            ? `Plan personal del ${date(d.latest.finishedAt)}: nadie más de tu comunidad había enviado sus datos. Cuando lo hagan, calcularemos el plan juntos y te avisaremos.`
            : `Calculado el ${date(d.latest.finishedAt)} con ${v!.participantsCount} ${v!.participantsCount === 1 ? 'familia' : 'familias'} de tu comunidad.`}
        </p>
      )}

      {v && <PlanResult view={v} />}
    </Page>
  );
}

/** Resultado del plan tal como lo ve UNA familia (se usa en su app y en la vista previa del panel). */
/** Lo más importante, en una tarjeta y en palabras simples (el detalle va debajo). */
function Summary({ me }: { me: NonNullable<PlanView['me']> }) {
  const com = me.strategies.community, cur = me.strategies.current;
  const inc = (c: StrategyCard) => c.indicators.income.mean;
  const loss = (c: StrategyCard) => Math.round(c.indicators.climateRisk.mean * 10);
  const diff = inc(com) - inc(cur);
  return (
    <Card title="Lo más importante" icon="sprout" className="accent">
      <p className="headline">La próxima campaña te conviene sembrar:</p>
      <ul className="navlist">
        {com.parcels.map((p) => (
          <li key={p.parcelId}>
            <div className="navitem">
              <span className="ico-tile"><Icon name="sprout" size={22} /></span>
              <span className="txt">
                <strong>{p.rotation[0]?.cropName}</strong>
                <small>en {p.parcelName}{p.rotation[0]?.sowing ? ` · sembrar cerca del ${p.rotation[0].sowing}` : ''}</small>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <ul className="facts-big">
        <li>
          <span><Icon name="coin" size={18} /> Ganarías por hectárea</span>
          <strong>S/ {fmt(inc(com))}</strong>
          <small>{Math.abs(diff) < 50 ? 'Casi igual que hoy' : diff > 0 ? `S/ ${fmt(diff)} más que hoy` : `S/ ${fmt(-diff)} menos que hoy`}</small>
        </li>
        <li>
          <span><Icon name="snow" size={18} /> Años con pérdida fuerte</span>
          <strong>{loss(com) === 0 ? 'Casi nunca' : `${loss(com)} de cada 10`}</strong>
          <small>Hoy: {loss(cur) === 0 ? 'casi nunca' : `${loss(cur)} de cada 10`}</small>
        </li>
      </ul>
      <p className="small muted">Es una simulación con el clima de los últimos 44 años, no una promesa. Revísalo con tu experiencia.</p>
    </Card>
  );
}

export function PlanResult({ view: v }: { view: PlanView }) {
  const [tab, setTab] = useState<Sid>('community');
  const me = v.me;
  const surplus = v.community.surplus_soles ?? 0;
  return (
    <>
      {!me && (
        <Card>
          <p>Tus datos no estaban enviados cuando se calculó este plan. Envíalos desde la página de la comunidad y se recalculará.</p>
        </Card>
      )}

      {me && <Summary me={me} />}
      {me && (
        <>
          <h2 className="section-title">Compara las opciones</h2>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <StrategyView card={me.strategies[tab]} current={me.strategies.current} utilitySolo={me.utilitySolo} />

          {tab === 'community' && (
            <Card title="Lo que te toca al coordinar" className="accent">
              {me.shapley.ayni.direction === 'recibe' && (
                <p>Por los cambios que haces para la comunidad te corresponde recibir unos <strong>{fmt(me.shapley.ayni.jornales, 1)} jornales</strong> de ayni (≈ S/ {fmt(me.shapley.ayni.soles)}), en trabajo, turnos de agua o semilla.</p>
              )}
              {me.shapley.ayni.direction === 'aporta' && (
                <p>Como el plan coordinado te favorece, te tocaría aportar unos <strong>{fmt(me.shapley.ayni.jornales, 1)} jornales</strong> de ayni (≈ S/ {fmt(me.shapley.ayni.soles)}) a quienes cambian más.</p>
              )}
              {me.shapley.ayni.direction === 'nada' && <p>No te toca dar ni recibir compensación.</p>}
              {surplus > 0 ? (
                <p className="small muted">Coordinar deja a toda la comunidad unos S/ {fmt(surplus)} más por campaña; se reparte según lo que aporta cada familia (valor de Shapley).</p>
              ) : (
                <p className="small muted">
                  Este plan no deja más dinero que si cada familia sembrara por su cuenta; su ventaja está en otros temas (plagas, suelo, agua), según las
                  prioridades de cada uno. Por eso no hay un excedente en soles que repartir.
                </p>
              )}
              <p className="small muted">{me.rationalityOk ? '✓ Según tus prioridades, no quedas peor que haciendo tu mejor plan solo.' : 'Según tus prioridades quedas un poco peor que solo; la compensación busca cubrir esa diferencia.'}</p>
            </Card>
          )}

          <Card title={`La comunidad (${v.participantsCount} ${v.participantsCount === 1 ? 'familia' : 'familias'})`}>
            <Bullets title="Lo que gana la comunidad al coordinar" items={v.community.mutualBenefit} />
            <h3>Qué se siembra en cada parcela</h3>
            <ul className="list">
              {v.community.plan.map((p, i) => (
                <li key={p.parcelId} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  {p.mine ? <span className="badge green">Tuya</span> : <span className="badge gray">Vecino {i + 1}</span>} {p.rotationText}
                </li>
              ))}
            </ul>
            <p className="small muted">Solo ves qué se siembra dónde. Las prioridades y compensaciones de cada familia son privadas.</p>
          </Card>

          {me.elNino.some((e) => e.current || e.community) && (
            <Card title="¿Y si vuelve un año como El Niño 2015-16?">
              <ul className="bullets">
                {me.elNino.filter((e) => e.current || e.community).map((e) => (
                  <li key={`${e.campaign}-${e.parcel}`}>
                    <strong>{e.parcel}, campaña {e.campaign}:</strong>{' '}
                    {e.current ? `${cropName(e.current.crop)} de hoy habría dado ${Math.round(e.current.yrel * 100)} %` : 'hoy en descanso'}
                    {' · '}
                    {e.community ? `${cropName(e.community.crop)} del plan, ${Math.round(e.community.yrel * 100)} %` : 'descanso en el plan'} de su cosecha posible.
                  </li>
                ))}
              </ul>
              <p className="small muted">Simulado con el clima real de esos años (NASA POWER + GPM IMERG). Años El Niño según NOAA (no NASA).</p>
            </Card>
          )}

          {me.fieldNotes.length > 0 && (
            <Card title="Tus observaciones ajustaron el modelo">
              <ul className="bullets">{me.fieldNotes.map((n) => <li key={n}>{n}</li>)}</ul>
            </Card>
          )}

          <Card title="Fuentes de datos">
            <ul className="bullets small">
              {v.dataCoverage.map((s) => (
                <li key={s.id}>
                  <strong>{s.product}</strong> {s.isNasa ? <span className="badge green">NASA</span> : <span className="badge gray">no NASA</span>} — {s.coverage}. <span className="muted">{s.access}</span>
                </li>
              ))}
            </ul>
            {v.warnings.length > 0 && <Bullets title="Avisos" items={v.warnings} />}
            <p className="small muted">«{v.goldenRule}»</p>
            <p className="small muted">Motor {v.engineVersion} · datos del valle {v.valleyVersion} · semilla {v.seed}</p>
          </Card>
        </>
      )}
    </>
  );
}
