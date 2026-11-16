import { useState, type FormEvent } from 'react';
import { SEASON_OPTIONS, WATER_SOURCE_LABEL, cropName, type Irrigation, type ParcelBody } from '@qullqa/shared';
import { ErrorMsg, Field } from './ui.tsx';

export type ParcelFormValue = Pick<ParcelBody, 'name' | 'irrigation' | 'currentRotation'>;

const SEASONS = ['Campaña 2024-25', 'Campaña 2025-26', 'Campaña 2026-27 (la de ahora)'];

export function ParcelForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: ParcelFormValue;
  submitLabel: string;
  onSubmit: (v: ParcelFormValue) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [rotation, setRotation] = useState<string[]>(initial?.currentRotation ?? ['', '', '']);
  const [irr, setIrr] = useState<Irrigation>(initial?.irrigation ?? { source: 'canal', turnsPerMonth: 2, hoursPerTurn: 2 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (rotation.some((r) => !r)) return setError('Indica qué hubo en la parcela en cada una de las 3 campañas.');
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, currentRotation: rotation as ParcelFormValue['currentRotation'], irrigation: irr });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const noWater = irr.source === 'none';

  return (
    <form onSubmit={submit}>
      <Field label="Nombre de la parcela" hint="Como la conocen en tu familia, por ejemplo «Andén de abajo».">
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
      </Field>

      <h3>¿Qué hubo en esta parcela?</h3>
      {SEASONS.map((label, i) => (
        <Field key={label} label={label}>
          <select value={rotation[i]} onChange={(e) => setRotation((r) => r.map((v, j) => (j === i ? e.target.value : v)))} required>
            <option value="">Elegir…</option>
            {SEASON_OPTIONS.map((id) => (
              <option key={id} value={id}>{cropName(id)}</option>
            ))}
          </select>
        </Field>
      ))}

      <h3>Agua</h3>
      <Field label="¿Cómo riegas?">
        <select
          value={irr.source}
          onChange={(e) => {
            const source = e.target.value as Irrigation['source'];
            setIrr(source === 'none' ? { source, turnsPerMonth: 0, hoursPerTurn: 0 } : { ...irr, source });
          }}
        >
          {Object.entries(WATER_SOURCE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>
      {!noWater && (
        <div className="row">
          <Field label="Turnos al mes" hint="En época seca">
            <input type="number" inputMode="numeric" min={0} max={31} value={irr.turnsPerMonth} onChange={(e) => setIrr({ ...irr, turnsPerMonth: Number(e.target.value) })} />
          </Field>
          <Field label="Horas por turno">
            <input type="number" inputMode="decimal" min={0} max={48} step={0.5} value={irr.hoursPerTurn} onChange={(e) => setIrr({ ...irr, hoursPerTurn: Number(e.target.value) })} />
          </Field>
        </div>
      )}
      <ErrorMsg error={error} />
      <button type="submit" disabled={busy}>{busy ? 'Guardando…' : submitLabel}</button>
    </form>
  );
}
