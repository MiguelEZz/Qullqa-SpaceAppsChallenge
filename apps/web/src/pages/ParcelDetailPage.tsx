import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OBSERVATION_META, WATER_SOURCE_LABEL, cropName, type Observation, type ObservationType, type Parcel } from '@qullqa/shared';
import { api } from '../api.ts';
import { useApi } from '../lib/hooks.ts';
import { Card, ErrorMsg, Loading, Page } from '../components/ui.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';
import { MapView } from '../components/MapView.tsx';
import { ParcelForm } from '../components/ParcelForm.tsx';
import { describeObservation } from './observationText.ts';

/** Símbolo para reconocer cada observación sin leer. */
const OBS_ICON: Record<ObservationType, IconName> = {
  green_cover: 'camera', residue: 'wheat', slope: 'mountain', phenology: 'sprout', frost: 'snow', wilting: 'wilt', soil_moisture: 'hand', erosion: 'rain', harvest: 'basket',
};

export function ParcelDetailPage() {
  const { cid = '', pid = '' } = useParams();
  const nav = useNavigate();
  const parcel = useApi<Parcel>(`/parcels/${pid}`);
  const obs = useApi<Observation[]>(`/parcels/${pid}/observations`);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const p = parcel.data;
  if (!p) return <Page title="Parcela" back={`/c/${cid}`}>{parcel.error ? <ErrorMsg error={parcel.error} /> : <Loading />}</Page>;

  async function remove() {
    if (!window.confirm(`¿Borrar «${p!.name}» y sus observaciones?`)) return;
    try {
      await api(`/parcels/${pid}`, { method: 'DELETE' });
      nav(`/c/${cid}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeObs(id: string) {
    await api(`/observations/${id}`, { method: 'DELETE' });
    void obs.reload();
  }

  return (
    <Page title={p.name} back={`/c/${cid}`}>
      <MapView center={p.ring[0]!} parcels={[{ id: p.id, ring: p.ring, mine: true }]} fitTo={p.ring} height="220px" />
      <Card>
        {editing ? (
          <ParcelForm
            initial={p}
            submitLabel="Guardar cambios"
            onSubmit={async (v) => {
              parcel.setData(await api<Parcel>(`/parcels/${pid}`, { method: 'PATCH', json: v }));
              setEditing(false);
            }}
          />
        ) : (
          <>
            <dl className="facts">
              <dt>Área</dt><dd>{p.areaHa.toFixed(3)} ha <span className="tag">observado</span></dd>
              <dt>Altitud (GPS)</dt><dd>{p.gps?.altitudeM != null ? `${Math.round(p.gps.altitudeM)} m` : '—'}</dd>
              <dt>Rotación</dt><dd>{p.currentRotation.map(cropName).join(' → ')}</dd>
              <dt>Riego</dt>
              <dd>
                {WATER_SOURCE_LABEL[p.irrigation.source]}
                {p.irrigation.source !== 'none' && ` · ${p.irrigation.turnsPerMonth} turnos/mes de ${p.irrigation.hoursPerTurn} h`}
              </dd>
            </dl>
            <button className="secondary" onClick={() => setEditing(true)}>Editar datos</button>
          </>
        )}
      </Card>

      <Card title="Anotar algo de esta chacra">
        <div className="grid">
          {(Object.keys(OBSERVATION_META) as ObservationType[]).map((t) => (
            <Link key={t} className="tile" to={`/c/${cid}/p/${pid}/obs/${t}`}>
              <span className="obs-ico" aria-hidden><Icon name={OBS_ICON[t]} size={24} /></span>
              {OBSERVATION_META[t].label}
            </Link>
          ))}
        </div>
      </Card>

      <Card title={`Mi bitácora (${obs.data?.length ?? 0})`}>
        {obs.data?.length === 0 && <p className="muted">Todavía no hay observaciones.</p>}
        <ul className="log">
          {obs.data?.map((o) => (
            <li key={o.id}>
              {o.hasPhoto && <img src={`/api/observations/${o.id}/photo`} alt="" loading="lazy" />}
              <div>
                <strong>{OBSERVATION_META[o.value.type].label}</strong>
                <span>{describeObservation(o.value)}</span>
                <small>{new Date(o.observedAt).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}</small>
              </div>
              <button className="icon" aria-label="Borrar" onClick={() => removeObs(o.id)}>×</button>
            </li>
          ))}
        </ul>
      </Card>

      <ErrorMsg error={error} />
      <button className="danger" onClick={remove}>Borrar parcela</button>
    </Page>
  );
}
