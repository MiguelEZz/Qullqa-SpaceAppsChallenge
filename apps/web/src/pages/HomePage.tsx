import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api.ts';
import { Link } from 'react-router-dom';
import type { Readiness } from '@qullqa/shared';
import { useSession } from '../lib/session.tsx';
import { useApi } from '../lib/hooks.ts';
import { Card, ErrorMsg, InstallBanner, LinkButton, Loading, Page } from '../components/ui.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';
import { CommunitySearch } from '../components/CommunitySearch.tsx';
import { PushButton } from '../components/Waiting.tsx';

/** Paso 5 mientras espera a sus vecinos: qué pasará y cuándo, y activar avisos. */
function WaitingInline({ waiting, memberCount, cid }: { waiting: NonNullable<PlanResponse['waiting']>; memberCount: number; cid: string }) {
  const when = new Date(waiting.personalPlanAt).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <>
      <p className="small">
        {memberCount > 1
          ? <><strong>{waiting.othersSubmitted} de {memberCount - 1}</strong> vecinos enviaron sus datos. Cuando lo hagan, calcularemos el plan de la comunidad y te avisaremos.</>
          : <>Todavía ninguno de tus vecinos está en Qullqa. <Link to={`/c/${cid}`}>Invítalos</Link>: cuando envíen sus datos, calcularemos el plan juntos y te avisaremos.</>} Si nadie envía hasta el <strong>{when}</strong>, te haremos un plan personal.
      </p>
      <PushButton />
    </>
  );
}
import type { PlanResponse } from './PlanPage.tsx';

type StepDef = { title: string; text: string; icon: IconName; done: boolean; action?: ReactNode };

/**
 * Inicio guiado: siempre dice QUÉ HACER AHORA con un solo botón grande, y debajo los 5 pasos con su ✓.
 * Pensado para quien recién crea su cuenta y no sabe por dónde empezar.
 */
export function HomePage() {
  const { me } = useSession();
  const first = me?.name.split(' ')[0] ?? '';
  const community = me?.communities[0] ?? null;
  const readiness = useApi<Readiness>(community ? `/communities/${community.id}/readiness` : null);
  const plan = useApi<PlanResponse>(community ? `/communities/${community.id}/plan` : null);
  const r = readiness.data;
  const cid = community?.id ?? '';
  const hasPlan = !!plan.data?.latest?.view.me;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setSending(true);
    setError(null);
    try {
      await api(`/communities/${cid}/submit`, { method: 'POST' });
      await Promise.all([readiness.reload(), plan.reload()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  const calculating = !!plan.data?.pending;
  // Mientras el cerebro calcula, el inicio se actualiza solo
  useEffect(() => {
    if (!calculating) return;
    const t = setInterval(() => void plan.reload(), 2500);
    return () => clearInterval(t);
  }, [calculating, plan]);

  const steps: StepDef[] = [
    {
      title: 'Elige tu comunidad', icon: 'users', done: !!community,
      text: community ? community.name : 'Busca el nombre de tu pueblo y únete a tus vecinos.',
    },
    {
      title: 'Marca tu chacra', icon: 'map', done: !!r?.hasParcel,
      text: 'Párate en cada esquina con el celular, o dibújala en el mapa.',
      action: <LinkButton to={`/c/${cid}/parcela/nueva`} icon="pin">MARCAR MI CHACRA</LinkButton>,
    },
    {
      title: 'Dinos qué te importa', icon: 'sprout', done: !!r?.preferencesSaved,
      text: 'Toca una o dos tarjetas: ganar más, no perder la cosecha… Es privado.',
      action: <LinkButton to={`/c/${cid}/prioridades`} icon="sprout">ELEGIR LO QUE ME IMPORTA</LinkButton>,
    },
    {
      title: 'Envía tus datos', icon: 'check', done: !!r?.submittedAt,
      text: 'Con un toque, tus datos entran al cálculo de tu comunidad.',
      action: <button onClick={() => void send()} disabled={sending}><Icon name="check" size={22} /> {sending ? 'ENVIANDO…' : 'ENVIAR MIS DATOS'}</button>,
    },
    {
      title: plan.data?.waiting ? 'Tu plan está en camino' : 'Mira tu plan de siembra', icon: plan.data?.waiting ? 'clock' : 'chart', done: hasPlan,
      text: calculating ? 'Estamos calculando tu plan… tarda unos segundos.' : plan.data?.waiting
        ? ''
        : plan.data && !plan.data.hasValleyData
        ? 'Todavía no tenemos los datos NASA de tu zona. Tu plan saldrá cuando estén listos.'
        : 'Qué te conviene sembrar, solo o con tus vecinos.',
      action: <LinkButton to={`/c/${cid}/plan`} icon="sprout">VER MI PLAN</LinkButton>,
    },
  ];
  const loading = !!community && ((!r && !readiness.error) || (!plan.data && plan.loading));
  const nextIdx = steps.findIndex((s) => !s.done);
  const allDone = nextIdx === -1;
  const next = allDone ? null : steps[nextIdx]!;

  return (
    <Page title={`Hola, ${first}`} variant="hero" kicker={allDone ? 'Todo listo' : 'Empecemos'}>
      {loading ? <Loading /> : (
        <>
          {/* El siguiente paso, grande y solo */}
          {next ? (
            <Card className="accent next-step">
              <p className="kicker">Paso {nextIdx + 1} de {steps.length} · Ahora haz esto</p>
              <h2><span className="ico-tile"><Icon name={next.icon} size={22} /></span>{next.title}</h2>
              {next.text && <p>{next.text}</p>}
              {nextIdx === 0 ? <CommunitySearch />
                : nextIdx === 4 && plan.data?.waiting ? <WaitingInline waiting={plan.data.waiting} memberCount={plan.data.memberCount} cid={cid} />
                : nextIdx === 4 && (calculating || (plan.data && !plan.data.hasValleyData)) ? null : next.action}
              <ErrorMsg error={error} />
            </Card>
          ) : (
            <Card className="ok next-step">
              <p className="kicker">¡Hiciste todos los pasos!</p>
              <h2><span className="ico-tile"><Icon name="sprout" size={22} /></span>Tu plan de siembra está listo</h2>
              <p>Revísalo con tu familia. Si cambias algo de tu chacra, vuelve a enviar tus datos y el plan se actualiza.</p>
              <LinkButton to={`/c/${cid}/plan`} icon="sprout">VER MI PLAN</LinkButton>
            </Card>
          )}

          {/* Todos los pasos, para saber cuánto falta */}
          <Card title="Tus pasos">
            <ol className="todo-steps">
              {steps.map((s, i) => (
                <li key={s.title} className={s.done ? 'done' : i === nextIdx ? 'current' : 'later'}>
                  <span className="num" aria-hidden>{s.done ? <Icon name="check" size={20} /> : i + 1}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.done ? (i === 0 ? s.text : 'Listo') : i === nextIdx ? 'Ahora' : 'Después'}</small>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {community && (
            <Card title="Atajos" icon="home">
              <ul className="navlist">
                <li>
                  <Link to={`/c/${cid}`}>
                    <span className="ico-tile"><Icon name="users" size={22} /></span>
                    <span className="txt"><strong>{community.name}</strong><small>Tu comunidad, tus chacras y tus vecinos</small></span>
                    <Icon name="chevron" />
                  </Link>
                </li>
                <li>
                  <Link to="/ayuda">
                    <span className="ico-tile"><Icon name="help" size={22} /></span>
                    <span className="txt"><strong>¿Tienes dudas?</strong><small>Preguntas frecuentes</small></span>
                    <Icon name="chevron" />
                  </Link>
                </li>
              </ul>
            </Card>
          )}
          <InstallBanner />
          {me?.isAdmin && <LinkButton to="/admin" variant="secondary" icon="chart">Panel de administración</LinkButton>}
        </>
      )}
    </Page>
  );
}
