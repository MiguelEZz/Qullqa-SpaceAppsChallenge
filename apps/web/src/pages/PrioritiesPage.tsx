import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CROPS, FOCUS_CARDS, INDICATORS, type Coins, type Constraints, type CropId, type FocusId, type IndicatorId, type PreferencesView } from '@qullqa/shared';
import { api } from '../api.ts';
import { useApi } from '../lib/hooks.ts';
import { Card, Choice, ErrorMsg, Field, Loading, Page } from '../components/ui.tsx';
import { Icon } from '../components/Icon.tsx';

const DEFAULT_CONSTRAINTS: Constraints = { traction: 'yunta', familyWorkers: 2, canGetExtraLabor: true, market: 'mixto', livestockHeads: 0 };

/**
 * «¿Qué te importa más?»: el agricultor toca 1–2 tarjetas en sus palabras. El servidor las convierte en los
 * pesos que usa el cerebro (supuestos editables del catálogo). Las 10 monedas quedan en «Ajustar en detalle».
 */
export function PrioritiesPage() {
  const { cid = '' } = useParams();
  const nav = useNavigate();
  const saved = useApi<PreferencesView | null>(`/communities/${cid}/preferences`);
  const [focus, setFocus] = useState<FocusId[]>([]);
  const [constraints, setConstraints] = useState<Constraints>(DEFAULT_CONSTRAINTS);
  const [vetoes, setVetoes] = useState<CropId[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [coins, setCoins] = useState<Coins | null>(null);
  const [coinsTouched, setCoinsTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!saved.data) return;
    setFocus(saved.data.focus);
    setConstraints(saved.data.constraints);
    setVetoes(saved.data.vetoes);
    setCoins(saved.data.coins);
    if (saved.data.coinsSource === 'manual' && !saved.data.focus.length) setAdvanced(true);
  }, [saved.data]);

  const toggleFocus = (id: FocusId) => {
    setCoinsTouched(false);
    setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length >= 2 ? [f[1]!, id] : [...f, id]));
  };
  const setC = <K extends keyof Constraints>(k: K) => (v: Constraints[K]) => setConstraints((c) => ({ ...c, [k]: v }));
  const used = coins ? Object.values(coins).reduce((a, b) => a + b, 0) : 0;
  const addCoin = (id: IndicatorId, d: number) => {
    setCoinsTouched(true);
    setCoins((c) => {
      const base = c ?? (Object.fromEntries(INDICATORS.map((i) => [i.id, 0])) as Coins);
      return { ...base, [id]: Math.max(0, Math.min(10, base[id] + d)) };
    });
  };

  async function save() {
    setError(null);
    const manual = advanced && coinsTouched;
    if (!manual && focus.length === 0) return setError('Toca al menos una tarjeta: lo que más te importa.');
    if (manual && used !== 10) return setError(used < 10 ? `Te faltan repartir ${10 - used} monedas.` : 'Repartiste más de 10 monedas.');
    setBusy(true);
    try {
      await api(`/communities/${cid}/preferences`, { method: 'PUT', json: { ...(manual ? { coins } : { focus }), constraints, vetoes } });
      nav('/', { replace: true }); // el inicio muestra el siguiente paso
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (saved.loading) return <Page title="Lo que te importa" back={`/c/${cid}`}><Loading /></Page>;

  return (
    <Page title="Lo que te importa" back={`/c/${cid}`}>
      <p className="notice"><Icon name="lock" size={22} /> <span>Esto es <strong>privado</strong>. Tus vecinos no lo ven. Solo sirve para buscar el plan que más te conviene.</span></p>

      <Card title="¿Qué es lo más importante para ti?">
        <p className="muted small">Toca una o dos tarjetas.</p>
        <div className="focus-grid">
          {FOCUS_CARDS.map((c) => {
            const pos = focus.indexOf(c.id);
            return (
              <button key={c.id} type="button" className={`focus ${pos >= 0 ? 'on' : ''}`} aria-pressed={pos >= 0} onClick={() => toggleFocus(c.id)}>
                {pos >= 0 && <span className="order" aria-label={pos === 0 ? 'primera' : 'segunda'}>{pos + 1}</span>}
                <span className="focus-ico" aria-hidden><Icon name={c.icon} size={38} /></span>
                <strong>{c.label}</strong>
                <small>{c.hint}</small>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Tu chacra y tu familia">
        <Field label="¿Con qué preparas la tierra?">
          <Choice value={constraints.traction} onChange={setC('traction')} options={[{ value: 'manual', label: 'A mano (chaquitaclla)' }, { value: 'yunta', label: 'Con yunta' }, { value: 'tractor', label: 'Con tractor' }]} />
        </Field>
        <Field label="¿A dónde va tu cosecha?">
          <Choice value={constraints.market} onChange={setC('market')} options={[{ value: 'autoconsumo', label: 'Para comer en casa' }, { value: 'feria_local', label: 'La vendo en la feria' }, { value: 'intermediario', label: 'La vendo a un intermediario' }, { value: 'mixto', label: 'Un poco de todo' }]} />
        </Field>
        <Counter label="¿Cuántos de tu familia trabajan la chacra?" value={constraints.familyWorkers} max={30} onChange={setC('familyWorkers')} />
        <Counter label="¿Cuántos animales tienes?" hint="Vacas, ovejas, alpacas, llamas…" value={constraints.livestockHeads} max={1000} onChange={setC('livestockHeads')} />
        <Field label="¿Puedes conseguir ayuda (peones, ayni, mink'a)?">
          <Choice value={constraints.canGetExtraLabor ? 'si' : 'no'} onChange={(v) => setC('canGetExtraLabor')(v === 'si')} options={[{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }]} />
        </Field>
      </Card>

      <Card title="¿Hay algo que NO quieres sembrar?">
        <p className="muted small">Toca los cultivos que no quieres. Si no hay ninguno, sigue adelante.</p>
        <div className="chips">
          {CROPS.map((c) => {
            const on = vetoes.includes(c.id);
            return (
              <button type="button" key={c.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setVetoes((v) => (on ? v.filter((x) => x !== c.id) : [...v, c.id]))}>
                {on ? '✕ ' : ''}{c.name}
              </button>
            );
          })}
        </div>
      </Card>

      <ErrorMsg error={error} />
      <button onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'GUARDAR'}</button>

      <div className="below">
        <button type="button" className="link" onClick={() => setAdvanced((v) => !v)}>{advanced ? 'Ocultar el ajuste en detalle' : 'Ajustar en detalle (para técnicos)'}</button>
      </div>
      {advanced && (
        <Card title="Ajuste en detalle: 10 monedas">
          <p className="muted small">
            Así repartimos lo que te importa entre 8 temas. Si cambias algo aquí, se usa esto en vez de las tarjetas.
            {!coinsTouched && focus.length > 0 && ' (Al guardar las tarjetas se recalcula.)'}
          </p>
          <p className={`coins-left ${used === 10 ? 'ok' : ''}`}>{used === 10 ? '✓ 10 monedas repartidas' : `Llevas ${used} de 10 monedas`}</p>
          <ul className="coins">
            {INDICATORS.map((i) => (
              <li key={i.id}>
                <div>
                  <strong>{i.label}</strong>
                  <small>{i.hint}</small>
                </div>
                <div className="stepper">
                  <button type="button" aria-label={`Quitar moneda a ${i.label}`} onClick={() => addCoin(i.id, -1)} disabled={!coins || coins[i.id] === 0}>−</button>
                  <span aria-label={`${coins?.[i.id] ?? 0} monedas`}>{coins?.[i.id] ?? 0}</span>
                  <button type="button" aria-label={`Poner moneda en ${i.label}`} onClick={() => addCoin(i.id, 1)} disabled={used >= 10}>+</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}

/** Contador con botones grandes − / + (más fácil que escribir un número). */
function Counter({ label, hint, value, max, onChange }: { label: string; hint?: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      {hint && <small style={{ margin: '0 0 6px' }}>{hint}</small>}
      <div className="stepper counter">
        <button type="button" aria-label="Menos" onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}>−</button>
        <input type="number" inputMode="numeric" min={0} max={max} value={value} onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} aria-label={label} />
        <button type="button" aria-label="Más" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}
