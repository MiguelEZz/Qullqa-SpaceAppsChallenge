import { Card, InstallBanner, LinkButton, Page } from '../components/ui.tsx';
import { GuestButton } from '../components/GuestButton.tsx';

/** Portada para quien aún no tiene cuenta. */
export function LandingPage() {
  return (
    <Page title="Decidamos juntos qué sembrar" variant="hero" kicker="Para las comunidades de la sierra">
      <section className="intro">
        <p>
          Qullqa junta el clima y los satélites de la NASA con lo que cada familia ve en su chacra. Así la comunidad elige qué sembrar, cuándo y con
          quién, y nadie sale perdiendo.
        </p>
        <GuestButton />
        <LinkButton to="/ingresar" icon="user">CREAR MI CUENTA</LinkButton>
        <LinkButton to="/ingresar?modo=ingresar" variant="secondary">Ya tengo cuenta</LinkButton>
      </section>
      <InstallBanner />

      <Card title="Cómo funciona" icon="sprout">
        <ol className="steps">
          <li><strong>Busca tu comunidad</strong><span>Yanque, Chivay, Coporaque… La forman los vecinos que se unen.</span></li>
          <li><strong>Marca tu chacra</strong><span>Camina el borde con el celular o dibújalo en el mapa.</span></li>
          <li><strong>Dinos qué te importa</strong><span>Ganar más, no perder la cosecha, cuidar tu tierra o tus animales.</span></li>
          <li><strong>Recibe tu plan</strong><span>Qué sembrar las próximas campañas, solo o junto a tus vecinos.</span></li>
        </ol>
      </Card>

      <Card title="Con datos que se pueden revisar" icon="chart">
        <p className="small">
          44 años de clima diario (NASA POWER), lluvia por satélite (NASA GPM IMERG), verdor y heladas de los andenes (NASA MODIS), relieve (NASA SRTM) y
          suelos (SoilGrids, ISRIC). Cada número dice de dónde viene.
        </p>
      </Card>
    </Page>
  );
}
