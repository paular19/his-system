# Lotes de facturacion: el rango de fechas automatico

Registro del cambio hecho el 2026-08-24 (commit `e17a114`) sobre el periodo de los lotes,
y de lo que quedo abierto despues.

## El problema original

`LoteFacturacion.periodo` era obligatorio y el modal de "Nuevo lote" lo **precargaba con el
mes actual**. Nadie elegia ese valor: aparecia solo. El lote entonces levantaba unicamente
las ordenes con `fechaEmision` dentro de ese mes, y todo lo anterior quedaba afuera sin
ningun aviso en pantalla.

Consecuencias medidas en su momento:

- El lote 36 (creado el 21/08, periodo 2026-08) dejo afuera al ingreso 353 (SILVESTRI),
  cuya orden era del 29/07.
- Julio 2026 nunca se loteo: 9 ingresos AMB/IPS por $237.214,17 sin lote.

## Que se cambio

1. `LoteFacturacion.periodo` paso a **nullable** (`String?`, `@map("LotPeriodo")`).
   Se aplico a mano en la base:

   ```sql
   ALTER TABLE "LoteFacturacion" ALTER COLUMN "LotPeriodo" DROP NOT NULL;
   ```

   No con `db push` — el diff real de esta base se lleva 11 indices y la secuencia
   `Paciente_HC_seq` (ver trampa 5 del `CLAUDE.md`).

   Verificado 2026-08-26: `information_schema` da `is_nullable = YES` en el schema
   `public`. (En el schema `demo` sigue en `NO`; ese schema no lo usa la app.)

2. El campo del modal **arranca vacio** y ya no es `required`.
   Ver el comentario en [lotes-panel.tsx:474](src/components/facturacion/lotes-panel.tsx#L474):
   el default invisible es justamente lo que se quiso sacar.

3. **Periodo vacio = sin filtro de fecha.** El lote levanta todo lo pendiente, de cualquier
   mes. Con periodo, solo las ordenes emitidas en ese mes.

4. La lectura del periodo se centralizo en tres helpers de
   [repository.ts:1169-1195](src/modules/facturacion/repository.ts#L1169-L1195)
   (`periodoToDateRange`, `rangoPeriodoOpcional`, `whereFechaEmisionPeriodo`), para que
   "sin periodo" no se colara como filtro por accidente en ninguna lectura.

5. `obtenerOrdenesTomadasEnLotes` dejo de filtrar por un solo periodo: ahora mira **todos**
   los lotes PEN/CON que podrian haberse llevado la orden y aplica **el rango de cada uno
   por separado**. Sin eso, un lote sin periodo re-tomaba ordenes que ya factura otro lote.

Se eligio `nullable` y no un centinela para que el compilador marcara cada lectura que
asumia periodo presente: aparecieron 8, dos de ellas en liquidacion de profesionales que
no estaban en el relevamiento inicial.

Dry run del momento sobre IPS/AMB: con periodo 2026-08 entraban 70 ingresos ($1.058.001,11);
sin periodo, 82 ($1.339.799,27), incluido SILVESTRI.

## Lo que sigue faltando (2026-08-26)

El cambio esta vivo en produccion: los lotes 38 a 43 se crearon sin periodo.

Pero **sacar el filtro de fecha no alcanza**, porque hay un segundo filtro: un lote nuevo
excluye las ordenes que ya toma otro lote **PEN o CON**. Y quedaron dos lotes viejos
pendientes:

| Lote | Periodo | Estado | Obra social | Items |
|------|---------|--------|-------------|-------|
| 31   | 2026-08 | PEN    | OSECAC      | 49    |
| 30   | 2026-08 | PEN    | OSECAC      | 10    |

Medido: **59 ingresos de OSECAC estan retenidos en los lotes 30 y 31 y no aparecen en
ninguno de los lotes nuevos sin periodo (39, 40, 41)**. Entre ellos ANDRADA (ing. 109),
ROBLEDO (185, 277), FLORES (188, 285), ARANCIBIA (190, 293), HERRERO (210) y otros 54.

**Confirmado con los cinco pacientes que se reportaron como faltantes el 2026-08-26.** Los
cinco estan en el lote 31 (PEN, periodo 2026-08, OSECAC) con `incluido = true`:

| Ingreso | Nro | Paciente | Lote | Importe |
|---------|-----|----------|------|---------|
| 271 | 156 | FERNANDEZ, CINTHIA FATIMA V. | 31 | 34.000 |
| 276 | 161 | GOMEZ, CAMILA MARIANA | 31 | 34.000 |
| 280 | 165 | VILTE, FLORENCIA EBE DEL MA | 31 | 34.000 |
| 284 | 168 | PUNTANO SUAREZ, ALDANA DEL VALLE | 31 | 34.000 |
| 361 | 220 | ARIAS BRIZUELA, JULIANA JAZMIN | 31 | 34.000 |

No es un problema de fechas: el rango ya no los filtra. Los retiene el lote 31. Cuatro de
los cinco venian arrastrados de los lotes 14, 17, 18 y 27, todos ya anulados.

O sea: si los lotes 30 y 31 son lotes viejos que ya no se van a usar, esos pacientes van a
seguir faltando en todo lote nuevo hasta que se los **anule** (como se hizo con 29, 32-37)
o se los facture. Anularlos los devuelve al pool de pendientes.

**Antes de dar por perdido un paciente en un lote, chequear en este orden:**

1. La `fechaEmision` de su orden contra el periodo del lote (si el lote tiene periodo).
2. Si esa orden ya esta tomada por otro lote en estado PEN o CON.

## Otro pendiente

Un lote sin periodo arrastra **pacientes de prueba** que antes tapaba el filtro de mes:
`FAST2, E2E UI` (10 ingresos) y `PACIENTE DE PRUEBA, numero 10` (2). Conviene limpiarlos o
excluirlos.

## Donde quedo el periodo obligatorio

El modal de **Importar Planilla IPS (TXT)** sigue precargando el mes actual y pidiendolo
como `required` ([lotes-panel.tsx:866](src/components/facturacion/lotes-panel.tsx#L866)).
Ahi no genera faltantes: los items salen del archivo TXT, no de una consulta filtrada por
fecha. El periodo es solo la etiqueta de la planilla.
