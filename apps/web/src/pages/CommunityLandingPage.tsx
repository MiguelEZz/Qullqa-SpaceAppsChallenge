import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CommunitySummary } from '@qullqa/shared';
import { api } from '../api.ts';
import { useApi } from '../lib/hooks.ts';
import { useSession } from '../lib/session.tsx';
import { Card, ErrorMsg, LinkButton, Loading, Page } from '../components/ui.tsx';

/** Página pública de una comunidad: destino del enlace o QR que comparten los vecinos (/comunidad/yanque). */
export function CommunityLandingPage() {
  const { slug = '' } = useParams();
  const { me, refresh } = useSession();
  const nav = useNavigate();
  const c = useApi<CommunitySummary>(`/communities/by-slug/${encodeURIComponent(slug)}`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    if (!c.data) return;
    setBusy(true);
    try {
      await api(`/communities/${c.data.id}/join`, { method: 'POST' });
      await refresh();
      nav(`/c/${c.data.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (c.error) return <Page title="Comunidad" back="/"><ErrorMsg error={c.error} /><LinkButton to="/comunidades">Buscar mi comunidad</LinkButton></Page>;
  if (!c.data) return <Page title="Comunidad"><Loading /></Page>;
  const d = c.data;
  return (
    <Page title={d.name} back={me ? '/' : undefined}>
      <p className="lead">Distrito de {d.district}, provincia de {d.province}, {d.region}.</p>
      <Card>
        <p className="stats">
          <span><strong>{d.memberCount}</strong> agricultores</span>
          <span><strong>{d.altitudeM ? `${d.altitudeM.toLocaleString('es-PE')} m` : '—'}</strong> altura del pueblo</span>
        </p>
        <p>
          En Qullqa, los vecinos de {d.name} registran sus parcelas y lo que ven en el campo. Con eso y con datos de la NASA, calculamos juntos qué
          sembrar, cuándo, y cómo repartir lo que se gana al coordinar.
        </p>
        {!d.hasValleyData && <p className="notice">El plan de esta zona estará disponible cuando procesemos sus datos NASA.</p>}
        <ErrorMsg error={error} />
        {d.isMember ? (
          <LinkButton to={`/c/${d.id}`}>Entrar a mi comunidad</LinkButton>
        ) : me ? (
          <button onClick={join} disabled={busy}>{busy ? 'Uniéndome…' : `Unirme a ${d.name}`}</button>
        ) : (
          <>
            <LinkButton to={`/ingresar?next=${encodeURIComponent(`/comunidad/${d.slug}`)}`}>Crear mi cuenta y unirme</LinkButton>
            <LinkButton to={`/ingresar?modo=ingresar&next=${encodeURIComponent(`/comunidad/${d.slug}`)}`} variant="secondary">Ya tengo cuenta</LinkButton>
          </>
        )}
      </Card>
    </Page>
  );
}
