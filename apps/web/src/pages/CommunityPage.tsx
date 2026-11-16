import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { OBSERVATION_META, cropName, type CommunityView, type Parcel, type Readiness } from '@qullqa/shared';
import { api } from '../api.ts';
import { useSession } from '../lib/session.tsx';
import { useApi } from '../lib/hooks.ts';
import { Card, ErrorMsg, LinkButton, Loading, Page } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';
import { MapView } from '../components/MapView.tsx';
import type { PlanResponse } from './PlanPage.tsx';

/** Resumen del plan en la página de la comunidad; el detalle está en /c/:cid/plan. */
function PlanSummary({ cid, submitted }: { cid: string; submitted: boolean }) {
  const plan = useApi<PlanResponse>(`/communities/${cid}/plan`);
  const d = plan.data;
  useEffect(() => {
    if (!d?.pending) return;
    const t = setInterval(() => void plan.reload(), 2500);
    return () => clearInterval(t);
  }, [d?.pending, plan]);
  if (!d || !d.hasValleyData) return null;
  const me = d.latest?.view.me;
  const com = me?.strategies.community;
  return (
    <Card title="Tu plan de siembra" icon="sprout" className={me ? 'accent' : ''}>
      {d.pending ? (
        <p className="status"><span className="spinner" aria-hidden /> Calculando el plan de la comunidad…</p>
      ) : me && com ? (
        <>
          <p className="headline">Para la próxima campaña te conviene sembrar:</p>
          <ul className="navlist">
            {com.parcels.map((p) => (
              <li key={p.parcelId}>
                <Link to={`/c/${cid}/plan`}>
                  <span className="ico-tile"><Icon name="sprout" size={22} /></span>
                  <span className="txt"><strong>{p.rotation[0]?.cropName}</strong><small>en {p.parcelName}{p.rotation[0]?.sowing ? ` · siembra cerca del ${p.rotation[0].sowing}` : ''}</small></span>
                </Link>
              </li>
            ))}
          </ul>
          {d.latest?.kind === 'personal' && <p className="small muted">Es tu plan personal. Cuando tus vecinos envíen sus datos, calcularemos el plan de la comunidad y te avisaremos.</p>}
        </>
      ) : (
        <p className="muted small">
          {d.waiting
            ? `Esperando a tus vecinos: ${d.waiting.othersSubmitted} de ${Math.max(0, d.memberCount - 1)} enviaron. Te avisaremos cuando tu plan esté listo; si nadie envía, el ${new Date(d.waiting.personalPlanAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })} te haremos un plan personal.`
            : submitted ? 'Tu plan aparecerá aquí cuando termine el cálculo. Te avisaremos.' : 'Envía tus datos para recibir tu plan: lo que siembras hoy, tu mejor plan solo y el plan con tus vecinos.'}
        </p>
      )}
      {(d.latest || d.pending) && <LinkButton to={`/c/${cid}/plan`}>{me ? 'VER MI PLAN COMPLETO' : 'Ver el plan'}</LinkButton>}
    </Card>
  );
}

/** Un paso numerado grande: hecho (verde con ✓) o pendiente, con su botón. */
function Step({ n, done, title, text, children }: { n: number; done: boolean; title: string; text: string; children?: ReactNode }) {
  return (
    <li className={done ? 'done' : ''}>
      <span className="num" aria-hidden>{done ? <Icon name="check" size={20} /> : n}</span>
      <div>
        <strong>{title}</strong>
        <small>{done ? 'Listo' : text}</small>
        {children}
      </div>
    </li>
  );
}

export function CommunityPage() {
  const { cid = '' } = useParams();
  const nav = useNavigate();
  const community = useApi<CommunityView>(`/communities/${cid}`);
  const parcels = useApi<Parcel[]>(`/communities/${cid}/my-parcels`);
  const readiness = useApi<Readiness>(`/communities/${cid}/readiness`);
  const [qr, setQr] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { refresh } = useSession();

  const c = community.data;
  const r = readiness.data;
  const inviteUrl = c?.slug ? `${location.origin}/comunidad/${c.slug}` : '';

  useEffect(() => {
    if (showInvite && inviteUrl) void QRCode.toDataURL(inviteUrl, { width: 480, margin: 1 }).then(setQr);
  }, [showInvite, inviteUrl]);

  async function share() {
    if (navigator.share && c) {
      try {
        await navigator.share({ title: `Qullqa — ${c.name}`, text: `Únete a ${c.name} en Qullqa para decidir juntos qué sembrar.`, url: inviteUrl });
        return;
      } catch {
        /* cancelado: mostramos el QR */
      }
    }
    setShowInvite((v) => !v);
  }

  async function leave() {
    if (!confirmLeave) return setConfirmLeave(true);
    setBusy(true);
    try {
      await api(`/communities/${cid}/leave`, { method: 'POST' });
      await refresh();
      nav('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      readiness.setData(await api<Readiness>(`/communities/${cid}/submit`, { method: 'POST' }));
      void community.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (community.error) return <Page title="Comunidad" back="/"><ErrorMsg error={community.error} /></Page>;
  if (!c || !r) return <Page title="Comunidad" back="/"><Loading /></Page>;

  const obsCount = r.observationTypes.length;
  const allParcels = c.parcels;

  return (
    <Page title={c.name} back="/">
      <p className="lead">
        {c.district && c.province ? `Distrito de ${c.district}, ${c.province}` : 'Comunidad'}
        {' · '}
        {c.hasValleyData ? <span className="badge green">Datos NASA del valle listos</span> : <span className="badge gray">Datos del valle en preparación</span>}
      </p>
      <PlanSummary cid={cid} submitted={!!r.submittedAt} />

      <Card title={r.submittedAt ? 'Tus datos ya están enviados' : 'Tus pasos para recibir tu plan'} className={r.submittedAt ? 'ok' : 'accent'}>
        <ol className="todo-steps">
          <Step n={1} done={r.hasParcel} title="Marca tu chacra" text="Camina el borde con el celular o dibújala en el mapa.">
            {!r.hasParcel && <LinkButton to={`/c/${cid}/parcela/nueva`} icon="map">Marcar mi chacra</LinkButton>}
          </Step>
          <Step n={2} done={r.preferencesSaved} title="Dinos qué te importa" text="Es privado: tus vecinos no lo ven.">
            {r.hasParcel && !r.preferencesSaved && <LinkButton to={`/c/${cid}/prioridades`} icon="sprout">Elegir lo que me importa</LinkButton>}
            {r.preferencesSaved && <Link to={`/c/${cid}/prioridades`} className="small">Cambiar</Link>}
          </Step>
          <Step n={3} done={!!r.submittedAt} title="Envía tus datos" text="Con eso calculamos el plan de la comunidad.">
            {!r.submittedAt && r.canSubmit && <button onClick={submit} disabled={busy}>{busy ? 'Enviando…' : 'ENVIAR MIS DATOS'}</button>}
          </Step>
        </ol>
        {r.submittedAt && (
          <p className="small muted">
            Enviados el {new Date(r.submittedAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}. Si cambias algo, vuelve a enviarlos.
          </p>
        )}
        <p className="small muted">
          Opcional: {obsCount} de {Object.keys(OBSERVATION_META).length} observaciones del campo. Ayudan a que el plan sea más seguro (sobre todo la cosecha).
        </p>
        <ErrorMsg error={error} />
      </Card>

      <Card title="Mis chacras" icon="map">
        {parcels.loading && <Loading />}
        {parcels.data?.length === 0 && <p className="muted">Aún no marcas ninguna chacra.</p>}
        <ul className="navlist">
          {parcels.data?.map((p) => (
            <li key={p.id}>
              <Link to={`/c/${cid}/p/${p.id}`}>
                <span className="ico-tile"><Icon name="sprout" size={22} /></span>
                <span className="txt">
                  <strong>{p.name}</strong>
                  <small>{p.areaHa.toFixed(2)} ha · ahora: {cropName(p.currentRotation[2])} · {p.observationCount} observaciones</small>
                </span>
                <Icon name="chevron" />
              </Link>
            </li>
          ))}
        </ul>
        <LinkButton to={`/c/${cid}/parcela/nueva`} variant="secondary" icon="plus">Agregar otra chacra</LinkButton>
      </Card>

      <Card title="Tu comunidad" icon="users">
        <p className="stats">
          <span><strong>{c.memberCount}</strong> agricultores</span>
          <span><strong>{c.submittedCount}</strong> enviaron datos</span>
          <span><strong>{allParcels.length}</strong> parcelas</span>
        </p>
        <MapView
          center={c.center}
          parcels={allParcels}
          fitTo={allParcels.length ? allParcels.flatMap((p) => p.ring) : undefined}
          onParcelClick={(id) => allParcels.find((p) => p.id === id)?.mine && nav(`/c/${cid}/p/${id}`)}
          height="260px"
        />
        <p className="muted small">Amarillo: tus chacras. Blanco: las de tus vecinos (solo se ve el borde).</p>
        {inviteUrl && (
          <>
            <button className="secondary" onClick={share}><Icon name="share" size={22} /> {showInvite ? 'Ocultar invitación' : 'Invitar a mis vecinos'}</button>
            {showInvite && (
              <div className="invite">
                {qr && <img src={qr} alt={`Código QR para unirse a ${c.name}`} />}
                <p className="small muted break">{inviteUrl}</p>
                <p className="small muted">Al escanearlo, tu vecino crea su cuenta y elige {c.name}. No necesita código.</p>
              </div>
            )}
          </>
        )}
      </Card>

      <div className="below">
        {!confirmLeave ? (
          <button className="link" onClick={() => setConfirmLeave(true)}>Salir de {c.name}</button>
        ) : (
          <Card title="¿Salir de la comunidad?">
            <p className="small muted">
                Si sales, se borran tus chacras, observaciones y lo que te importa en {c.name}. Los planes ya calculados no cambian.
            </p>
            <button className="danger" onClick={leave} disabled={busy}>Sí, salir y borrar mis datos aquí</button>
            <button className="secondary" onClick={() => setConfirmLeave(false)}>No, quedarme</button>
          </Card>
        )}
      </div>
    </Page>
  );
}
