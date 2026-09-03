# HIS System — Guía para Claude

Sistema de gestión hospitalaria (Clínica San Rafael). Next.js 15 App Router + TypeScript
estricto + Prisma/PostgreSQL (Neon) + Clerk.

Este archivo documenta lo que **no** se deduce leyendo el código. Si algo ya es evidente en
el repo, no va acá.

---

## Trampas conocidas (leer antes de tocar prácticas o nomenclador)

### 1. Nunca cargar `nomencladorPractica` desde `Practica`

La relación `Practica.nomencladorPractica` usa **FK compuesta** `(convenioId, codigoPractica)`.
Cargarla vía `select`/`include` hace **crashear el query engine de Prisma 6.5**:

```
Expected parent IDs to be set when ordering by parent ID.
```

Se dispara cuando muchas filas de `Practica` comparten el mismo `(convenioId, codigoPractica)`
— frecuente en cirugías, donde una práctica se repite por GA/HE/HA/A1. Es **intermitente**:
un set de 26 filas puede romper y su superset de 34 pasar.

**Siempre usar el helper:**

```ts
import { claveNomenclador, obtenerDescripcionesNomenclador } from '@/lib/nomenclador'

const descripciones = await obtenerDescripcionesNomenclador(practicas)
const desc = descripciones.get(claveNomenclador(p.convenioId, p.codigoPractica))
```

Cargarla desde `OrdenPractica` (`prisma.orden.findMany → items → nomencladorPractica`) **sí es
seguro** — esa relación no presenta el problema.

Pendiente sin arreglar: `src/modules/admision/repository.ts:184` (`incluirRelacionesDetalle`)
tiene el patrón peligroso, pero es código muerto. No reconectarlo sin migrarlo al helper.

### 2. Los códigos de práctica tienen padding inconsistente

`Practica.codigoPractica` es `VarChar(8)` y `NomencladorPractica.codigo` es `Char(8)`. En la
base conviven `"720329"` y `"720329  "` para el mismo código.

Postgres compara ignorando el padding, pero **Prisma matchea relaciones en memoria comparando
strings de JS**, así que `"720329" !== "720329  "` y la descripción se pierde en silencio.

> **Regla:** `.trim()` en todo `codigoPractica` antes de comparar, agrupar o usar como clave.

### 3. Schema legacy — no tocar el mapeo

Las tablas vienen de un sistema anterior (`@map("PraID")`, `@map("NPrCodig")`, tabla
`NPractica`, etc.). **No renombrar columnas ni agregar/cambiar `@map`.** Los nombres feos son
intencionales.

Tras cambios de schema: `npx prisma generate`, y para bajar el cambio a la base leer la
trampa 5 antes de correr `db push`.

### 4. Estado nulo en filtros

`Practica.estado` es nullable. `{ estado: { not: 'X' } }` **no** trae los `null`. Para "activas"
hay que usar `OR: [{ estado: null }, { estado: { not: 'X' } }]`.

### 5. `prisma db push` es destructivo en esta base

La base tiene objetos que **no** están declarados en `schema.prisma`, así que `db push` los
interpreta como drift y los borra. Medido con `migrate diff` (2026-08-23), un push haría:

- `DROP SEQUENCE "Paciente_HC_seq"` → se rompe la asignación de HC de **todo** paciente nuevo.
- `DROP INDEX` sobre 11 índices de performance creados a mano (`idx_npractica_descripcion_trgm`,
  `idx_obrasocial_nombre_trgm`, `idx_medicacion_nombre_trgm`, etc.).

**Regla:** antes de tocar la base, mirar el SQL real:

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
```

Si el diff trae `DROP`, no correr `db push`: aplicar a mano solo el `CREATE` que hace falta
(`$executeRawUnsafe` con `IF NOT EXISTS`) y verificar después que la secuencia y los índices
sigan vivos.

---

## Deploy

```bash
npm run prod:deploy    # corre preflight y después vercel --prod
```

El preflight (`scripts/prod-preflight.ps1`) **aborta** si: no estás en `main`, hay cambios sin
commitear (incluye archivos untracked), o `HEAD` no está alineado con `origin/main`. O sea:
deployar exige commit + push primero.

---

## Convenciones

- **Comentarios y mensajes de commit sin tildes** (`descripcion`, `practicas`). La UI sí las usa.
- Commits en español con prefijo: `fix:`, `chore:`, `feat:`.
- Estructura de módulo: `types.ts`, `schemas.ts`, `repository.ts`, `service.ts`, `actions/`.
- Roles (RBAC en `src/lib/auth/rbac.ts`): ADMIN, ADMISION, MEDICO, ENFERMERIA, FACTURACION, CAJA.
- Fechas: Prisma devuelve `Date`; los `<input type="date">` necesitan `YYYY-MM-DD`. Convertir en
  el server component con `.toISOString().split('T')[0]`.
- Helpers de fecha con zona horaria argentina: `src/lib/utils/argentina-date.ts`.

---

## Archivo historico (`ArchivoPaciente` / modulo `archivo`)

Copia congelada de la base del sistema anterior, para ubicar el legajo en el archivo fisico.
Vive **aislada a proposito**:

- Sin FK ni relaciones Prisma hacia `Paciente` ni ninguna tabla del HIS. **No joinear.**
- El `pacienteIdViejo` **no** es el `Paciente.id` nuevo. Que coincidan es casualidad.
- Solo lectura: el módulo no expone `actions/` ni ninguna escritura. No usarlo como fuente
  para crear o actualizar pacientes.
- El `PacHC` viejo solo existe para 19.046 de las 54.154 filas; el resto nunca tuvo número.
  Mostrar "sin HC" no es un bug de carga.
- `busqueda` es una columna denormalizada que llena el import. El import y el buscador comparten
  `src/modules/archivo/normalizar.ts`: si se cambia la normalización, hay que **recargar** la
  tabla (`npm run db:import-archivo -- --archivo="..." --reemplazar`) o los términos dejan de
  matchear en silencio.

### Ingresos y obras sociales del sistema viejo

Además de `ArchivoPaciente` hay tres tablas más, con las mismas reglas de aislamiento:
`ArchivoObraSocial` (395), `ArchivoPlanObraSocial` (382) y `ArchivoIngreso` (8.665).

**La base vieja está restaurada localmente**, no hay que pedir exports: instancia
`.\SQLEXPRESS`, bases `SanRafael` y `SanRafaelLegacy` (idénticas). El import lee de ahí con
`sqlcmd` — sin dependencias nuevas — y las filas viajan como NDJSON (`FOR JSON PATH`), así los
saltos de línea de las observaciones no rompen el parseo:

```bash
npm run db:archivo-ddl                              # crea las tablas (ver trampa 5)
npm run db:import-archivo-ingresos -- --dry-run
npm run db:import-archivo-ingresos -- --reemplazar
```

Dos detalles del extractor que ya costaron una vuelta:

- `sqlcmd` necesita `-u` (salida UTF-16LE, se lee con `readFile(..., 'utf16le')`). Sin eso
  escribe en la codepage de consola y `MUÑOZ` sale `MU?OZ`.
- El JSON trae la hora sin zona. Hay que agregarle la `Z` antes de `new Date()`: la app formatea
  leyendo las partes en UTC, así que interpretarla como local corre todo tres horas.

Qué esperar de estos datos, medido:

- Solo **3.606 de los 54.154** pacientes del archivo tienen algún ingreso. El sistema anterior se
  puso en producción a fines de 2024 (`Ingreso` arranca el 2024-12-23, `Orden` el 2024-02-14) y
  los pacientes se migraron en bloque. **No hay internaciones anteriores a eso**: las ~95 filas
  con fecha 2001-2023 son carga de prueba (IDs consecutivos, todas `20/02/<año>`, usuario
  SUPERVISOR). Que un paciente no tenga ingresos es lo normal, no un bug del import.
- De 8.665 ingresos, **2.646 son internaciones** (`esInternacion`, `TigCodig = 'I'`) y el resto
  ambulatorios. Fecha de egreso en 2.622 y motivo en 2.606: el 70% no tiene egreso cargado.
- Los motivos de egreso viejos son de 3 letras (`ALT`/`OBI`/`VOL`/`ANU`/`TRA`) y **no coinciden**
  con `MotivoEgreso` del HIS nuevo, que usa 2 (`AL`/`AV`/`FA`/`FU`/`TR`). Por eso se guarda el par
  código + descripción, sin mapear.
- Quedan afuera 322 ingresos sin `PacID` (153 de ellos internaciones): no se pueden colgar de
  ningún paciente del archivo.
- `ArchivoObraSocial` existe porque el maestro nuevo no alcanza: tiene 89 obras sociales contra
  las 395 del viejo, y resolver `ArchivoPaciente.obraSocialIdViejo` contra `ObraSocial` dejaba
  18.326 pacientes sin nombre (214 ids huérfanos). Contra la tabla del archivo resuelven 54.153
  de 54.154.
- Estas tablas **no declaran relaciones Prisma**. La FK de plan es compuesta `(OSID, PosID)`, que
  es justo el patrón de la trampa 1; los nombres van desnormalizados en cada fila y el cruce con
  el paciente se hace en memoria (`obtenerIngresosDePacientes`).

---

## Trabajar con la base

`.env.local` necesita `DATABASE_URL` (pooled, con `-pooler` en el host) y `DIRECT_URL`
(no-pooled, para migraciones). Si Prisma se queja, sacar `channel_binding=require`.

**La base es producción.** Datos reales de pacientes. Scripts de lectura, sin problema;
cualquier escritura se pregunta primero.

Para reproducir algo puntual: script `tmp-*.ts` en la raíz + `npx tsx`, y borrarlo al terminar
(`@/` resuelve bien con tsx). **Filtrar siempre el output** — un panic de Prisma escupe ~3KB de
URL encodeada por error:

```bash
npx tsx ./tmp-x.ts 2>&1 | grep -vE "^prisma:|panicked|RUST_BACK|github.com/prisma"
```

---

## Cómo pedir las cosas (para gastar menos tokens)

### Si es un bug, pegá el error

Una URL sola obliga a buscar la ruta, leer la página y reproducir a ciegas. El stack de
Vercel (Deployment → Runtime Logs) suele contener la respuesta entera.

```
❌ "arreglá el error de https://.../internacion/343/practicas?cirugiaId=100"
✅ "error en https://.../internacion/343/practicas?cirugiaId=100
    Vercel logs: Invalid `prisma.practica.findMany()` — Expected parent IDs to be set..."
```

### Decí el alcance de entrada

Evita una ronda de ida y vuelta:

- `"solo esta página, no explores más"`
- `"arreglá y decime qué más está en riesgo, pero no lo toques"`
- `"arreglá todo lo que encuentres del mismo bug"`

### Decí qué hacer al terminar

- `"no commitees"` / `"commiteá pero no pushees"` / `"commiteá, pusheá y deployá"`

### Higiene de contexto

- `/clear` al cambiar de tema — si no, cada mensaje relee toda la conversación anterior.
- `/compact` si es continuación pero la charla se hizo larga.

### Instrucciones para Claude

- Si el pedido es un bug sin log ni stack: **pedir el log antes de explorar el repo**, salvo
  que el error sea reproducible localmente en un paso.
- Antes de proponer un fix sobre datos: reproducirlo contra la base. Los bugs de esta app
  suelen depender de los datos, no de la lógica.
- Reportar hallazgos con números medidos (`0 panics en 56 corridas`), no con adjetivos.
