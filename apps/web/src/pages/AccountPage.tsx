import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useSession } from '../lib/session.tsx';
import { Card, ErrorMsg, Field, Page } from '../components/ui.tsx';
import { RecoveryCodeNotice } from '../components/RecoveryCode.tsx';

const pinInput = (v: string, set: (s: string) => void, auto = 'current-password') => (
  <input value={v} onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" autoComplete={auto} pattern="\d{4}" required />
);

export function AccountPage() {
  const { me, refresh, logout } = useSession();
  const nav = useNavigate();
  const [name, setName] = useState(me?.name ?? '');
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [codePin, setCodePin] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [delPin, setDelPin] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState<{ where: string; msg: string } | null>(null);

  const run = (where: string, fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError({ where, msg: (err as Error).message });
    }
  };
  const err = (where: string) => <ErrorMsg error={error?.where === where ? error.msg : null} />;

  if (!me) return null;
  return (
    <Page title="Mi cuenta" back="/">
      <p className="lead">
        Celular terminado en <strong>···{me.phoneHint}</strong> · cuenta creada el {new Date(me.createdAt).toLocaleDateString('es-PE', { dateStyle: 'long' })}
      </p>

      <Card title="Mi nombre">
        <form onSubmit={run('name', async () => {
          await api('/me', { method: 'PATCH', json: { name } });
          await refresh();
          setNameMsg('✓ Guardado');
        })}>
          <Field label="Nombre" hint="Así te ven tus vecinos en la comunidad.">
            <input value={name} onChange={(e) => { setName(e.target.value); setNameMsg(null); }} autoComplete="name" required minLength={2} maxLength={60} />
          </Field>
          {err('name')}
          {nameMsg && <p className="success">{nameMsg}</p>}
          <button type="submit" className="secondary">Guardar nombre</button>
        </form>
      </Card>

      <Card title="Cambiar mi PIN">
        <form onSubmit={run('pin', async () => {
          await api('/me/pin', { method: 'POST', json: { currentPin: cur, newPin: nw } });
          setCur(''); setNw('');
          setPinMsg('✓ Tu PIN fue cambiado');
        })}>
          <div className="row">
            <Field label="PIN actual">{pinInput(cur, setCur)}</Field>
            <Field label="PIN nuevo">{pinInput(nw, setNw, 'new-password')}</Field>
          </div>
          {err('pin')}
          {pinMsg && <p className="success">{pinMsg}</p>}
          <button type="submit" className="secondary">Cambiar PIN</button>
        </form>
      </Card>

      <Card title="Código de recuperación">
        {code ? (
          <RecoveryCodeNotice code={code} onDone={() => setCode(null)} doneLabel="Listo" />
        ) : (
          <form onSubmit={run('code', async () => {
            const r = await api<{ recoveryCode: string }>('/me/recovery-code', { method: 'POST', json: { pin: codePin } });
            setCodePin('');
            setCode(r.recoveryCode);
          })}>
            <p className="small muted">¿Perdiste tu código? Genera uno nuevo; el anterior dejará de servir.</p>
            <Field label="Tu PIN actual">{pinInput(codePin, setCodePin)}</Field>
            {err('code')}
            <button type="submit" className="secondary">Generar código nuevo</button>
          </form>
        )}
      </Card>

      <button className="secondary" onClick={() => void logout().then(() => nav('/', { replace: true }))}>Cerrar sesión</button>

      <Card title="Borrar mi cuenta" className="">
        <p className="small muted">
          Se borran para siempre tu cuenta, tus parcelas, observaciones, fotos y prioridades. Los planes ya calculados de tu comunidad se conservan
          sin tu nombre ni tu teléfono.
        </p>
        {showDelete ? (
          <form onSubmit={run('delete', async () => {
            await api('/me/delete', { method: 'POST', json: { pin: delPin } });
            await refresh();
            nav('/', { replace: true });
          })}>
            <Field label="Escribe tu PIN para confirmar">{pinInput(delPin, setDelPin)}</Field>
            {err('delete')}
            <button type="submit" className="danger">Borrar mi cuenta para siempre</button>
            <button type="button" className="link" onClick={() => setShowDelete(false)}>Cancelar</button>
          </form>
        ) : (
          <button className="danger" onClick={() => setShowDelete(true)}>Quiero borrar mi cuenta</button>
        )}
      </Card>
    </Page>
  );
}
