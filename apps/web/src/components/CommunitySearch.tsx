import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CommunitySummary } from '@qullqa/shared';
import { api } from '../api.ts';
import { useSession } from '../lib/session.tsx';
import { ErrorMsg } from './ui.tsx';

/**
 * Buscador de comunidades del catálogo. Al elegir una, el agricultor se une (sin código ni líder):
 * la comunidad la forman quienes la eligen y marcan sus parcelas en ella.
 */
export function CommunitySearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const { me, refresh } = useSession();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [list, setList] = useState<CommunitySummary[] | null>(null);
  const [picked, setPicked] = useState<CommunitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api<CommunitySummary[]>(`/communities?q=${encodeURIComponent(q)}`).then(setList, (e: Error) => setError(e.message));
    }, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [q]);

  async function join(c: CommunitySummary) {
    if (!me) return nav(`/ingresar?next=${encodeURIComponent(`/comunidad/${c.slug}`)}`);
    if (c.isMember) return nav(`/c/${c.id}`);
    setBusy(true);
    setError(null);
    try {
      const firstCommunity = (me.communities ?? []).length === 0;
      await api(`/communities/${c.id}/join`, { method: 'POST' });
      await refresh();
      // La primera vez vuelve al inicio, que muestra el siguiente paso
      nav(firstCommunity ? '/' : `/c/${c.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (picked) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>{picked.name}</h3>
        <p className="muted small">
          Distrito de {picked.district}, provincia de {picked.province} · {picked.altitudeM ? `~${picked.altitudeM.toLocaleString('es-PE')} m de altura` : ''}
        </p>
        <p>
          {picked.memberCount === 0
            ? 'Aún nadie se ha unido. Puedes ser el primero: la comunidad la forman quienes marcan sus parcelas aquí.'
            : `${picked.memberCount} ${picked.memberCount === 1 ? 'agricultor ya se unió' : 'agricultores ya se unieron'}.`}
        </p>
        {!picked.hasValleyData && (
          <p className="notice">
            Todavía no procesamos los datos NASA de esta zona. Puedes registrar tus parcelas y observaciones; el plan se calculará cuando el
            valle esté listo.
          </p>
        )}
        <ErrorMsg error={error} />
        <button onClick={() => join(picked)} disabled={busy}>
          {busy ? 'Uniéndome…' : picked.isMember ? 'Entrar a mi comunidad' : `Sí, soy de ${picked.name}`}
        </button>
        <button className="secondary" onClick={() => setPicked(null)}>Buscar otra</button>
      </div>
    );
  }

  return (
    <div>
      <label className="field">
        <span className="lbl">¿De qué comunidad eres?</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej.: Yanque, Chivay, Uchumayo"
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>
      <ErrorMsg error={error} />
      {list && list.length === 0 && (
        <p className="muted small">
          No encontramos «{q}». Prueba con el nombre del pueblo o del distrito. Si tu comunidad no está, escríbenos desde Ayuda para agregarla.
        </p>
      )}
      <ul className="list" aria-live="polite">
        {list?.slice(0, q ? 12 : 8).map((c) => (
          <li key={c.id}>
            <button className="item" onClick={() => setPicked(c)}>
              {c.isMember ? <span className="badge green">Ya eres parte</span> : c.hasValleyData ? <span className="badge">Plan disponible</span> : null}
              <strong>{c.name}</strong>
              <small>
                {c.province} · {c.memberCount} {c.memberCount === 1 ? 'agricultor' : 'agricultores'}
              </small>
            </button>
          </li>
        ))}
      </ul>
      {!q && list && list.length > 8 && <p className="muted small">Escribe para ver las {list.length} comunidades.</p>}
    </div>
  );
}
