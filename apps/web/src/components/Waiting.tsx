import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { enablePush, pushPermission } from '../lib/push.ts';
import { useSession } from '../lib/session.tsx';
import { Card, ErrorMsg } from './ui.tsx';
import { Icon } from './Icon.tsx';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

/** «Esperando a tus vecinos»: qué va a pasar y cuándo, sin botón de «pedir plan». */
export function WaitingCard({ personalPlanAt, othersSubmitted, memberCount, cid, onStarted }: { personalPlanAt: string; othersSubmitted: number; memberCount: number; cid: string; onStarted: () => void }) {
  return (
    <Card title="Esperando a tus vecinos" icon="clock" className="accent">
      <GuestPlanNow cid={cid} onStarted={onStarted} />
      <p>
        Ya enviaste tus datos. Ahora falta que tus vecinos de la comunidad envíen los suyos para calcular el plan juntos.
        {memberCount <= 1 && ' Todavía ninguno de tus vecinos está en Qullqa: invítalos.'}
      </p>
      <ul className="facts-big">
        <li><span><Icon name="users" size={18} /> Vecinos que enviaron</span><strong>{memberCount > 1 ? `${othersSubmitted} de ${memberCount - 1}` : 'Aún nadie'}</strong></li>
        <li><span><Icon name="clock" size={18} /> Tu plan personal llega</span><strong className="date">{longDate(personalPlanAt)}</strong></li>
      </ul>
      <p className="small">
        Cuando un vecino envíe sus datos, calcularemos el plan de la comunidad y <strong>te avisaremos</strong>. Si nadie envía hasta esa fecha, te
        haremos un plan solo para ti.
      </p>
      <PushButton />
      <Link to={`/c/${cid}`} className="btn secondary"><Icon name="share" size={22} /> Invitar a mis vecinos</Link>
    </Card>
  );
}

/**
 * Modo invitado (jurado de NASA Space Apps): genera al momento el plan personal que normalmente
 * llegaría cuando envían los vecinos o a los 3 días, para ver cómo se presentan los resultados.
 */
export function GuestPlanNow({ cid, onStarted }: { cid: string; onStarted: () => void }) {
  const { me } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me?.isGuest) return null;
  return (
    <div className="guest-now">
      <p className="kicker">Modo invitado · NASA Space Apps Challenge</p>
      <p className="small">No hace falta esperar a la comunidad: genera ahora tu plan personal y mira cómo llegan los resultados.</p>
      <button type="button" className="guest-btn" disabled={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          await api(`/communities/${cid}/plan/now`, { method: 'POST', json: {} });
          onStarted();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}>
        <Icon name="chart" size={22} /> {busy ? 'Un momento…' : 'GENERAR MI PLAN AHORA'}
      </button>
      <ErrorMsg error={error} />
    </div>
  );
}

/** Botón para recibir los avisos en el celular (notificación aunque la app esté cerrada). */
export function PushButton() {
  const [perm, setPerm] = useState(pushPermission());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (perm === 'granted') return <p className="success small"><Icon name="bell" size={18} /> Te avisaremos en este celular.</p>;
  if (perm === 'unsupported') return null;
  return (
    <>
      <button onClick={async () => {
        setBusy(true);
        const r = await enablePush().catch((e: Error) => ({ ok: false, message: e.message }));
        setBusy(false);
        setPerm(pushPermission());
        setMsg(r.ok ? null : r.message ?? null);
      }} disabled={busy}>
        <Icon name="bell" size={22} /> {busy ? 'Activando…' : 'AVISARME EN EL CELULAR'}
      </button>
      <ErrorMsg error={msg} />
    </>
  );
}
