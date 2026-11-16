import { useState } from 'react';

/** Muestra el código de recuperación UNA vez y pide confirmar que se anotó. */
export function RecoveryCodeNotice({ code, onDone, doneLabel = 'Ya lo anoté, continuar' }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [ok, setOk] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p>
        Este es tu <strong>código de recuperación</strong>. Si olvidas tu PIN, con este código y tu número podrás crear uno nuevo.
      </p>
      <div className="secret" aria-label="Código de recuperación">{code}</div>
      <ul className="small muted">
        <li>Anótalo en un papel y guárdalo con tus documentos.</li>
        <li>No se lo des a nadie: quien lo tenga puede entrar a tu cuenta.</li>
        <li>Solo lo verás ahora. Cada vez que lo uses recibirás uno nuevo.</li>
      </ul>
      <button
        className="secondary"
        type="button"
        onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true), () => {})}
      >
        {copied ? '✓ Copiado' : 'Copiar código'}
      </button>
      <label className="check" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Ya anoté mi código en un lugar seguro.</span>
      </label>
      <button type="button" onClick={onDone} disabled={!ok}>{doneLabel}</button>
    </div>
  );
}
