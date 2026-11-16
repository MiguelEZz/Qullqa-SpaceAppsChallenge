import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { platform, useInstallPrompt } from '../lib/hooks.ts';
import { SITE_URL } from '../lib/site.ts';
import { Card, LinkButton, Page } from '../components/ui.tsx';

const URL_APP = `${SITE_URL}/descargar`;

function Steps({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <Card className="accent" title={title}>
      <ol className="bullets">{children}</ol>
      {note && <p className="small muted">{note}</p>}
    </Card>
  );
}

/**
 * «Descargar la app»: Qullqa se instala desde el navegador (PWA). Con Chrome en Android basta un botón;
 * en los demás casos explicamos el camino exacto de ESE celular/navegador.
 */
export function DownloadPage() {
  const { canInstall, install, standalone, installed, waited } = useInstallPrompt();
  const p = platform();
  const [qr, setQr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!p.mobile) void QRCode.toDataURL(URL_APP, { width: 480, margin: 1, color: { dark: '#2b201b', light: '#ffffff' } }).then(setQr);
  }, [p.mobile]);

  const copy = () => void navigator.clipboard?.writeText(URL_APP).then(() => setCopied(true), () => {});

  let body: ReactNode;
  if (standalone || done) {
    body = (
      <Card className="ok">
        <p className="success">✓ Qullqa ya está instalada en este celular.</p>
        <LinkButton to="/">Abrir mi inicio</LinkButton>
      </Card>
    );
  } else if (canInstall) {
    body = (
      <Card className="accent">
        <button onClick={() => void install().then((ok) => ok && setDone(true))}>Instalar Qullqa</button>
        <p className="small muted center">Te preguntará si quieres agregarla a tu pantalla de inicio. Toca «Instalar».</p>
      </Card>
    );
  } else if (installed) {
    body = (
      <Card className="ok">
        <p className="success">✓ Ya tienes Qullqa instalada.</p>
        <p className="small">Búscala en tu pantalla de inicio o en tus aplicaciones: es el ícono del hongo.</p>
      </Card>
    );
  } else if (p.inApp) {
    body = (
      <Card className="accent" title={`Estás dentro de ${p.appName ?? 'otra app'}`}>
        <p>Desde {p.appName ?? 'aquí'} no se puede instalar. Ábrela en el navegador:</p>
        <ol className="bullets">
          <li>Toca los <strong>tres puntitos ⋮</strong> de arriba a la derecha.</li>
          <li>Elige <strong>«Abrir en Chrome»</strong>{p.ios ? ' o «Abrir en Safari»' : ''}.</li>
          <li>Ahí aparecerá el botón <strong>«Instalar Qullqa»</strong>.</li>
        </ol>
        <button className="secondary" onClick={copy}>{copied ? '✓ Enlace copiado: pégalo en Chrome' : 'Copiar el enlace'}</button>
      </Card>
    );
  } else if (p.ios) {
    body = p.iosSafari ? (
      <Steps title="En iPhone" note="Apple no permite instalar con un solo botón desde una página: son estos 3 toques.">
        <li>Toca <strong>Compartir</strong> (el cuadrado con una flecha ↑, abajo).</li>
        <li>Baja y toca <strong>«Agregar a inicio»</strong>.</li>
        <li>Toca <strong>«Agregar»</strong>. Aparecerá el hongo de Qullqa.</li>
      </Steps>
    ) : (
      <Card className="accent" title="Abre Qullqa en Safari">
        <p>En iPhone solo <strong>Safari</strong> puede instalarla. Copia el enlace y pégalo en Safari.</p>
        <button className="secondary" onClick={copy}>{copied ? '✓ Enlace copiado' : 'Copiar el enlace'}</button>
      </Card>
    );
  } else if (p.android && p.chrome && !waited) {
    body = (
      <Card className="accent">
        <p className="status center"><span className="spinner" aria-hidden /> Preparando la instalación…</p>
      </Card>
    );
  } else if (p.android && p.samsung) {
    body = (
      <Steps title="En el navegador Samsung">
        <li>Toca el menú <strong>☰</strong> (abajo a la derecha).</li>
        <li>Toca <strong>«Añadir página a» → «Pantalla de inicio»</strong>.</li>
        <li>Confirma con <strong>«Añadir»</strong>.</li>
      </Steps>
    );
  } else if (p.android && !p.chrome) {
    body = (
      <Card className="accent" title="Mejor ábrela en Chrome">
        <p>
          Con {p.brave ? 'Brave' : p.miui ? 'el navegador de Xiaomi' : p.huawei ? 'el navegador de Huawei' : p.opera ? 'Opera' : p.firefox ? 'Firefox' : 'este navegador'} no aparece el botón de instalar.
          Copia el enlace, ábrelo en <strong>Chrome</strong> y toca «Instalar Qullqa».
        </p>
        <button className="secondary" onClick={copy}>{copied ? '✓ Enlace copiado: pégalo en Chrome' : 'Copiar el enlace'}</button>
        <p className="small muted">También puedes usar el menú de este navegador → «Agregar a pantalla de inicio».</p>
      </Card>
    );
  } else if (p.android) {
    body = (
      <Steps
        title="Chrome no mostró el botón: hazlo desde el menú"
        note="Pasa si alguna vez cerraste el aviso de instalar o si Qullqa ya estaba instalada. Si ya la tenías, búscala en tus aplicaciones (el hongo)."
      >
        <li>Toca los <strong>tres puntitos ⋮</strong> (arriba a la derecha).</li>
        <li>Toca <strong>«Instalar app»</strong> o <strong>«Agregar a la pantalla principal»</strong>.</li>
        <li>Confirma con <strong>«Instalar»</strong>.</li>
      </Steps>
    );
  } else {
    body = (
      <Card className="accent" title="Escanea con tu celular">
        {qr && <div className="invite"><img src={qr} alt="Código QR para abrir qullqa.us/descargar en el celular" /></div>}
        <p className="small center">Abre la cámara del celular y apunta al código. En la computadora, Chrome o Edge muestran un ícono de instalar en la barra de direcciones.</p>
      </Card>
    );
  }

  return (
    <Page title="Descargar la app" back="/">
      <div className="center">
        <img src="/icon-192.png" alt="Ícono de Qullqa" width={96} height={96} style={{ borderRadius: 22, boxShadow: 'var(--shadow)', margin: '6px 0 10px' }} />
        <p className="lead">Instala Qullqa en tu celular: queda con su ícono, se abre como app y ocupa menos de 2 MB. Es gratis.</p>
      </div>
      {body}
      <Card title="Preguntas">
        <p className="small"><strong>¿Está en Play Store?</strong> Todavía no. Se instala desde aquí, es la misma app y se actualiza sola.</p>
        <p className="small"><strong>¿Necesito internet?</strong> Para guardar y ver el plan, sí. La app abre aunque tengas poca señal.</p>
        <p className="small"><strong>¿Ocupa mucho?</strong> No, menos de 2 MB. No pide permisos al instalarse; el GPS y la cámara se piden solo cuando los usas.</p>
      </Card>
    </Page>
  );
}
