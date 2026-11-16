import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DISCLAIMER, TERMS_VERSION } from '@qullqa/shared';
import { CONTACT_EMAIL } from '../lib/site.ts';
import { Card, Page } from '../components/ui.tsx';

const updated = new Date(`${TERMS_VERSION}T12:00:00`).toLocaleDateString('es-PE', { dateStyle: 'long' });

function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page title={title} back="/">
      <p className="lead">Última actualización: {updated}</p>
      <Card className="legal">{children}</Card>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Legal title="Términos y condiciones">
      <p>
        Qullqa es una herramienta gratuita, en etapa piloto, que ayuda a las comunidades campesinas de la sierra de Arequipa a decidir juntas
        qué sembrar. Al crear una cuenta aceptas estas condiciones.
      </p>
      <h2>1. Qué es y qué no es Qullqa</h2>
      <p>
        Qullqa combina datos públicos de clima y satélite con la información que tú registras, y simula qué podría pasar con distintas
        rotaciones. <strong>{DISCLAIMER}</strong> Los resultados son estimaciones y simulaciones, no garantías de cosecha, de precio ni de
        ingreso.
      </p>
      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Te registras con tu nombre, tu celular y un PIN de 4 números. Eres responsable de no compartir tu PIN ni tu código de recuperación.</li>
        <li>Una cuenta es de una sola persona. No uses el número de otra persona sin su permiso.</li>
        <li>Puedes cambiar tu PIN o borrar tu cuenta cuando quieras desde «Mi cuenta».</li>
      </ul>
      <h2>3. Comunidades</h2>
      <p>
        Las comunidades ya están registradas en Qullqa. Te unes eligiendo la tuya; no hay dueño ni coordinador. La comunidad la forman quienes
        se unen y marcan sus parcelas. Puedes salir cuando quieras: al salir se borran tus parcelas y datos en esa comunidad.
      </p>
      <h2>4. Lo que registras</h2>
      <ul>
        <li>Registra solo parcelas que trabajas tú o tu familia, y datos que sean verdaderos según tu conocimiento.</li>
        <li>Los datos que envías se usan para calcular el plan de tu comunidad (ver la <Link to="/privacidad">política de privacidad</Link>).</li>
        <li>Participar en el plan comunitario es voluntario. Ninguna recomendación te obliga.</li>
      </ul>
      <h2>5. Compensaciones (ayni)</h2>
      <p>
        Cuando el plan coordinado genera una ganancia, Qullqa sugiere cómo repartirla (en jornales, turnos de agua o semilla). Es una sugerencia
        para conversar en la comunidad; Qullqa no maneja dinero ni hace cumplir acuerdos.
      </p>
      <h2>6. Fuentes de datos</h2>
      <p>
        Usamos datos de NASA (POWER, GPM IMERG, MODIS, SRTM) y de otras instituciones (SoilGrids de ISRIC, WorldCover de ESA, NOAA). Cada valor
        indica su fuente. Qullqa no está afiliada a la NASA ni a esas instituciones.
      </p>
      <h2>7. Responsabilidad</h2>
      <p>
        Qullqa se ofrece «tal cual». No respondemos por pérdidas de cosecha, de ingresos u otros daños que resulten de decisiones tomadas con la
        herramienta. Consulta siempre con tu experiencia, tu comunidad y un técnico agrícola.
      </p>
      <h2>8. Cambios</h2>
      <p>Si cambiamos estos términos, te lo avisaremos en la aplicación y te pediremos aceptarlos de nuevo cuando el cambio sea importante.</p>
      <h2>9. Contacto</h2>
      <p>Escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </Legal>
  );
}

export function PrivacyPage() {
  return (
    <Legal title="Política de privacidad">
      <p>
        Tratamos tus datos personales conforme a la Ley N.° 29733, Ley de Protección de Datos Personales del Perú, y su reglamento. Aquí te
        explicamos qué guardamos, para qué y quién lo ve.
      </p>
      <h2>Qué datos guardamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> nombre, número de celular, PIN y código de recuperación (estos dos cifrados: nadie puede leerlos, ni nosotros).</li>
        <li><strong>Parcelas:</strong> contorno, área, altitud del GPS, riego y cultivos de las últimas campañas.</li>
        <li><strong>Observaciones de campo:</strong> los valores que registras (pendiente, humedad, helada, cosecha…) y, si tú quieres, una foto pequeña.</li>
        <li><strong>Prioridades:</strong> tus 10 monedas, tus recursos (mano de obra, yunta o tractor, ganado) y los cultivos que no quieres sembrar.</li>
      </ul>
      <h2>Quién ve qué</h2>
      <ul>
        <li><strong>Tus prioridades y recursos son privados.</strong> Ningún vecino los ve. Solo los usa el cálculo del plan.</li>
        <li>Tus vecinos ven el <strong>contorno</strong> de tu parcela en el mapa, sin tu nombre ni tus observaciones.</li>
        <li>La vista de la comunidad muestra solo totales y el plan acordado, nunca las monedas de nadie.</li>
        <li>Tu número de celular no se muestra a nadie.</li>
        <li>El equipo de Qullqa ve estadísticas para mejorar la herramienta: parcelas y observaciones sin tu nombre («Familia 3»), y promedios de prioridades solo cuando hay al menos 3 familias.</li>
      </ul>
      <h2>Fotos</h2>
      <p>
        La foto de cobertura verde se procesa en tu teléfono. Al servidor solo sube el porcentaje calculado y, si lo eliges, una miniatura.
      </p>
      <h2>Para qué los usamos</h2>
      <p>
        Solo para calcular y mostrarte el plan de tu comunidad y mejorar el modelo del valle (por ejemplo, comparar tu cosecha real con la
        simulada). No vendemos ni compartimos tus datos con empresas, bancos ni autoridades, salvo orden judicial.
      </p>
      <h2>Dónde se guardan</h2>
      <p>
        En un servidor en la nube (Microsoft Azure), con conexión cifrada (HTTPS). Cada cálculo guarda una copia fija de los datos usados, para
        poder explicar el resultado.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes ver y corregir tus datos en la aplicación, salir de una comunidad o borrar tu cuenta desde «Mi cuenta» (se borra todo, de forma
        definitiva). Los planes ya calculados conservan la copia de los datos que se usaron en ese cálculo, sin tu nombre ni tu teléfono. Para cualquier otra solicitud (acceso,
        rectificación, cancelación u oposición) escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <h2>Cookies</h2>
      <p>Usamos una sola cookie, necesaria para mantener tu sesión abierta. No usamos publicidad ni rastreadores.</p>
    </Legal>
  );
}

export function HowItWorksPage() {
  return (
    <Page title="Cómo funciona" back="/">
      <p className="lead">Qullqa es un «gemelo digital» de tu comunidad: una copia en la computadora de las chacras, el clima y el suelo, para probar planes antes de sembrar.</p>
      <Card title="1. Lo que ponen los agricultores">
        <p className="small">
          Cada familia marca sus parcelas, cuenta qué sembró las últimas tres campañas, cuánta agua de riego tiene y reparte 10 monedas entre lo que
          más le importa. También puede registrar observaciones con el celular: pendiente, humedad del suelo con la prueba del puño, heladas,
          cosechas.
        </p>
      </Card>
      <Card title="2. Lo que pone la NASA y otras fuentes">
        <ul className="small">
          <li><strong>Clima diario desde 1981</strong> — NASA POWER, corregido por la altura de cada parcela.</li>
          <li><strong>Lluvia satelital</strong> — NASA GPM IMERG, para corregir la lluvia del valle.</li>
          <li><strong>Vegetación y temperatura de noche</strong> — NASA MODIS: cuándo reverdece el valle y dónde hiela más.</li>
          <li><strong>Relieve</strong> — NASA SRTM. <strong>Suelos</strong> — SoilGrids (ISRIC, no NASA).</li>
        </ul>
      </Card>
      <Card title="3. El cálculo">
        <p className="small">
          Simulamos cada rotación posible en los 44 años de clima: el agua del suelo día a día, las heladas, la erosión y la cosecha esperada. Luego
          buscamos el plan que más conviene a la comunidad <strong>sin que nadie quede peor que sembrando solo</strong>, evitando que todos siembren
          lo mismo (baja el precio y se pasan las plagas) y escalonando el riego.
        </p>
      </Card>
      <Card title="4. Lo que recibes">
        <p className="small">
          Tres opciones: tu rotación actual, tu mejor plan por tu cuenta y el plan coordinado. Cada una dice por qué, con qué datos, qué riesgos
          revisar y qué tan seguros estamos. Si coordinar genera ganancia, se sugiere un reparto justo en ayni.
        </p>
      </Card>
      <p className="muted small">{DISCLAIMER}</p>
    </Page>
  );
}

export function HelpPage() {
  const faq: [string, ReactNode][] = [
    ['¿Cuándo recibo mi plan?', <>Cuando envías tus datos esperamos a que tus vecinos también los envíen, para calcular el plan juntos. Te avisamos apenas esté listo. Si en 3 días nadie más envía, te hacemos un plan solo para ti. Si tu comunidad ya tiene plan, el tuyo se calcula enseguida.</>],
    ['No encuentro mi comunidad', <>Busca por el nombre del pueblo o del distrito, sin preocuparte por las tildes. Si no está, escríbenos y la agregamos.</>],
    ['Olvidé mi PIN', <>Entra a <Link to="/recuperar">Recuperar mi PIN</Link> con tu número y tu código de recuperación.</>],
    ['¿Mis vecinos ven mis monedas?', <>No. Tus prioridades son privadas. Ellos solo ven el contorno de tus parcelas y el plan de la comunidad.</>],
    ['¿Necesito internet en la chacra?', <>Para marcar la parcela con GPS no, pero sí para guardar. Si no tienes señal, guarda cuando vuelvas al pueblo.</>],
    ['¿Por qué dice «plan disponible» solo en algunas comunidades?', <>Porque solo calculamos el plan donde ya procesamos los datos NASA del valle. Hoy: el corredor Chivay–Yanque–Coporaque.</>],
    ['¿Cómo instalo Qullqa en mi celular?', <>Abre qullqa.us en Chrome y toca «Instalar» o «Agregar a la pantalla de inicio». Aparecerá el hongo de Qullqa.</>],
  ];
  return (
    <Page title="Ayuda" back="/">
      <Card title="Preguntas frecuentes">
        {faq.map(([q, a]) => (
          <details key={q} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
            <summary style={{ fontWeight: 600, cursor: 'pointer' }}>{q}</summary>
            <p className="small" style={{ marginBottom: 0 }}>{a}</p>
          </details>
        ))}
      </Card>
      <Card title="Escríbenos">
        <p className="small">Si algo no funciona o quieres agregar tu comunidad, escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Nunca te pediremos tu PIN.</p>
      </Card>
    </Page>
  );
}
