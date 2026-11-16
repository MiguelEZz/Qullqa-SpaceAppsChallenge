import { useState } from 'react';
import { Link } from 'react-router-dom';
import { enablePush, pushPermission } from '../lib/push.ts';
import { Card, ErrorMsg } from './ui.tsx';
import { Icon } from './Icon.tsx';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

/** «Esperando a tus vecinos»: qué va a pasar y cuándo, sin botón de «pedir plan». */
export function WaitingCard({ personalPlanAt, othersSubmitted, memberCount, cid }: { personalPlanAt: string; othersSubmitted: number; memberCount: number; cid: string }) {
  return (
    <Card title="Esperando a tus vecinos" icon="clock" className="accent">
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
