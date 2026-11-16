# Arquitectura de Qullqa

Qullqa tiene dos mitades:

- **La carcasa** (`apps/web`, `apps/api`): la app del agricultor, las comunidades, la captura de datos de campo y la entrega de resultados. No contiene lógica agronómica.
- **El cerebro** (`packages/engine`, `packages/data`, `packages/catalog`, `apps/worker`): los datos del valle, la simulación de rotaciones, la optimización comunitaria y el reparto justo.

```
            celular (PWA)                         navegador del administrador
                 │  HTTPS (un solo origen: qullqa.us)          │
                 ▼                                              ▼
        ┌──────────────────────── Caddy (HTTPS automático) ────────────────────────┐
        │   /        → PWA estática (apps/web/dist)                                │
        │   /api/*   → API Fastify (apps/api)                                      │
        └──────────────────────────────────┬───────────────────────────────────────┘
                                           │
                    ┌──────────────────────▼──────────────────────┐
                    │  PostgreSQL + PostGIS                       │
                    │  usuarios · comunidades · parcelas ·         │
                    │  observaciones · prioridades · runs (cola,  │
                    │  snapshot y resultado) · avisos             │
                    └──────────────────────▲──────────────────────┘
                                           │  LISTEN/NOTIFY + SKIP LOCKED
                    ┌──────────────────────┴──────────────────────┐
                    │  Worker: runCommunity(snapshot) → resultado │
                    │  avisos en la app y Web Push                │
                    └──────────────────────▲──────────────────────┘
                                           │ lee
                    packages/data/fixtures/colca.json  (dataset del valle, versionado)
```

## Paquetes

| Paquete | Qué contiene |
|---|---|
| `packages/shared` | Tipos y esquemas zod compartidos: cuerpos de la API, `EngineInput`, `ValleyDataset`, observaciones, tarjetas de prioridades. |
| `packages/catalog` | Fichas de los 10 cultivos de sierra (etapas, Kc, Ky, heladas, rendimiento, precio, costo, fuente) y **todos los supuestos editables** (`assumptions.ts`): umbrales, elasticidad, reglas de rotación, pesos de las tarjetas. |
| `packages/data` | Clientes de NASA POWER, GPM IMERG (GES DISC), MODIS NDVI y LST (Planetary Computer), SRTM (OpenTopoData), SoilGrids y ESA WorldCover. Arma el `ValleyDataset` del valle. |
| `packages/engine` | Motor de decisión **puro**: sin red, sin base de datos, sin `Date.now()` ni `Math.random()` (PRNG con semilla). |
| `apps/api` | Fastify: cuentas (celular + PIN), comunidades de catálogo, parcelas (PostGIS), observaciones, prioridades, cuándo se calcula el plan, avisos, panel de administración y exportación CSV. |
| `apps/worker` | Toma las corridas en cola, ejecuta el motor, guarda resultado y snapshot, marca quién recibió plan y avisa. |
| `apps/web` | PWA React instalable: inicio guiado, marcar la chacra por esquinas, «¿Qué te importa más?», plan, avisos y panel. |

## El motor (`packages/engine`)

1. **Clima de la parcela.** Serie diaria de POWER (1981–2025) con la lluvia corregida por GPM IMERG; temperatura corregida por altura (gradiente 6,5 °C/km) y por posición (δ mensual a partir de la temperatura nocturna de MODIS).
2. **Aptitud.** Para cada cultivo y parcela: altura, heladas, grados-día, agua y pH → apto, marginal o no apto, con razones.
3. **Simulación por campaña** (julio–junio), día a día:
   - Balance hídrico FAO-56 con dos compartimentos, raíz que crece, Ks y RAW. Cierra a 1e-6.
   - Fecha de siembra por inicio de lluvias (secano) o ventana del cultivo (riego).
   - Rendimiento relativo `Yrel = Π (1 − Ky·(1 − ETa/ETc))` por etapa, por daño de helada y calor en etapas sensibles.
   - Erosión RUSLE, materia orgánica, crédito de nitrógeno (rango supuesto) y forraje.
   - Memoización por (cultivo, campaña, cultivo anterior).
4. **Rotaciones candidatas** de 3 campañas, filtradas por reglas agronómicas: máximo 1 descanso, el mismo cultivo no más de 2 campañas seguidas y un tubérculo para familias que comen de su chacra.
5. **8 indicadores** (agua, riesgo climático, materia orgánica, nitrógeno, erosión, plagas, ingreso, forraje):
   - valor prudente: 0,6·media + 0,4·p20 en los positivos, 0,6·media + 0,4·p80 en los negativos;
   - normalización con umbrales fijos, nunca min-max.
6. **Efectos compartidos entre vecinos:**
   - plagas: índice de continuidad de hospederos;
   - precio: elasticidad con sobreoferta local;
   - pico de riego comunal;
   - erosión cuenca abajo.
7. **Optimización:**
   - mejor plan individual de cada familia;
   - recocido simulado del bienestar comunitario, con la **racionalidad individual como restricción** (nadie queda peor que con su mejor plan solo).
8. **Reparto justo:** valor de Shapley (exacto hasta 10 familias, por permutaciones con más), traducido a ayni en jornales.
9. **Explicación de cada opción:** por qué, evidencia, beneficios, riesgos a revisar, confianza (alta, media o baja, y qué falta para subirla) y procedencia de cada número.

`runCommunity(snapshot)` recibe un **snapshot inmutable**: entrada de cada familia, versión del dataset, catálogo, supuestos, semilla y, si corresponde, planes fijos. Es determinista: la misma entrada con la misma semilla da el mismo resultado.

## Cuándo se calcula el plan

| Situación | Qué pasa | `runs.kind` |
|---|---|---|
| La familia envía sus datos y es la única de su comunidad | Espera a sus vecinos; ve la fecha de su plan personal | — |
| Otra familia envía y la comunidad aún no tiene plan | Plan comunitario con todos los que enviaron | `community` |
| Alguien envía en una comunidad que ya tiene plan | Su plan se calcula con los planes de los vecinos **fijos** | `incremental` |
| Pasan 72 h y nadie más envió | Plan personal (programador en la API, cada 10 min) | `personal` |

Cuando termina un cálculo, el worker crea los avisos (`notifications`) y, si la familia dio permiso, envía una notificación al celular (Web Push con claves VAPID).

## Datos y privacidad

- **Prioridades privadas.** Lo que le importa a cada familia (tarjetas → monedas), sus recursos y sus vetos nunca se devuelven a otros miembros. `privateView` filtra el resultado para cada agricultor: su plan completo, más los agregados y el plan de la comunidad.
- **Historia.** Cada corrida guarda una copia fija de los datos de ese momento, y el panel muestra la evolución de cada comunidad.
- **Panel de administración** (`ADMIN_PHONES`): familias anónimas; los promedios solo se muestran con al menos 3 familias; los CSV no llevan nombres ni teléfonos.
- **Comunidad demo.** Familias sintéticas marcadas con `is_demo`, que no cuentan en las estadísticas reales.

## Comunidades

Las comunidades son un **catálogo fijo** de 31 pueblos de la sierra de Arequipa (`apps/api/src/communityCatalog.ts`). Nadie las crea y no hay códigos: el agricultor busca la suya y se une. Solo las que tienen datos del valle procesados (hoy el corredor Chivay–Yanque–Coporaque) calculan planes.

## Infraestructura

- **Local:** `infra/docker-compose.yml` levanta PostgreSQL + PostGIS (puerto 5434) y Caddy; `pnpm dev` levanta API, worker y web.
- **Producción:** una VM con `infra/docker-compose.prod.yml` (Caddy con HTTPS automático, API, worker, PostGIS y respaldo diario de la base) y el dominio qullqa.us. `infra/azure.sh` despliega el último commit, copia solo las claves necesarias y descarga respaldos.
