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

Tras cambios de schema: `npx prisma generate` y después `npx prisma db push`.

### 4. Estado nulo en filtros

`Practica.estado` es nullable. `{ estado: { not: 'X' } }` **no** trae los `null`. Para "activas"
hay que usar `OR: [{ estado: null }, { estado: { not: 'X' } }]`.

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
