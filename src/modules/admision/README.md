# Modulo de Admision

## Objetivo

El modulo de Admision gestiona el ciclo de vida del ingreso de un paciente:

- Alta de ingreso (ambulatorio o internacion)
- Consulta y busqueda paginada
- Actualizacion del ingreso
- Registro de diagnosticos
- Registro de movimientos

Tambien dispara procesos asociados:

- Informe de hospitalizacion para ingresos `INT`
- Informe ambulatorio para subtipos ambulatorios habilitados
- Creacion de practicas y medicaciones al ingreso (cuando corresponde)

---

## Ubicacion en el proyecto

- UI dashboard:
  - `src/app/(dashboard)/admision/page.tsx`
  - `src/app/(dashboard)/admision/nuevo/page.tsx`
  - `src/app/(dashboard)/admision/[id]/page.tsx`
- API:
  - `src/app/api/admision/route.ts`
  - `src/app/api/admision/[id]/route.ts`
  - `src/app/api/admision/[id]/diagnostico/route.ts`
  - `src/app/api/admision/[id]/movimiento/route.ts`
  - `src/app/api/admision/tipos-movimiento/route.ts`
- Modulo:
  - `src/modules/admision/service.ts`
  - `src/modules/admision/repository.ts`
  - `src/modules/admision/schemas.ts`
  - `src/modules/admision/actions/index.ts`

---

## Arquitectura

- `schemas.ts`: validacion de payloads (Zod) y tipos de entrada
- `service.ts`: reglas de negocio, validaciones de dominio, auditoria y orquestacion
- `repository.ts`: acceso a base de datos (Prisma), sin SQL directo
- `actions/index.ts`: Server Actions con chequeo de permisos
- API routes: contratos HTTP para clientes externos/internos

Regla general: UI/API -> `service` -> `repository` -> DB

---

## Reglas de negocio clave

1. Deben existir `Paciente` y `TipoIngreso` para crear un ingreso.
2. Si llega `subtipoAdmisionCodigo`, debe existir en `SubtipoAdmision`.
3. Si llega `planId`, debe llegar `obraSocialId`.
4. El `numeroIngreso` se genera de forma atomica incrementando `TipoIngreso.proximoNumero`.
5. Si `tipoIngresoCodigo === INT`, se crea `InformeHospitalizacion` automaticamente.
6. Si `tipoIngresoCodigo === AMB` y el subtipo esta habilitado, se crea `InformeAmbulatorio`.
7. Si llegan practicas al crear ingreso, se persisten como entidades reales (`Practica`).
8. Toda operacion relevante registra auditoria.

---

## Permisos (RBAC)

- `ADMISION/LEER`: listar, buscar y ver detalle
- `ADMISION/CREAR`: crear ingresos, diagnosticos y movimientos
- `ADMISION/MODIFICAR`: actualizar ingreso
- `AMBULATORIO/CREAR`: acciones relacionadas con autorizaciones desde ficha

Si un usuario no tiene permiso, la UI redirige y/o la API responde `403`.

---

## Endpoints principales

- `GET /api/admision`: lista/busqueda (filtros y paginacion)
- `POST /api/admision`: crea ingreso
- `GET /api/admision/[id]`: obtiene detalle
- `PUT /api/admision/[id]`: actualiza ingreso
- `POST /api/admision/[id]/diagnostico`: agrega diagnostico
- `POST /api/admision/[id]/movimiento`: agrega movimiento
- `GET /api/admision/tipos-movimiento`: catalogo para movimientos

---

## Seeds y datos base

Para que Admision funcione correctamente, se recomienda ejecutar:

```bash
npm run db:seed
```

Este seed maestro carga, entre otros:

- `TipoIngreso` (`AMB`, `INT`)
- `TipoInternacion`
- `SubtipoAdmision`
- `MotivoEgreso`
- `TipoMovimientoIngreso`
- `TipoOrden`

Si se necesita solo refrescar subtipos:

```bash
npx tsx prisma/seed-subtipos-admision.ts
```

Si se requiere cargar o refrescar profesionales para los selectores de admision:

```bash
npm run db:import-profesionales
```

---

## Flujo rapido de smoke test

1. Ejecutar `npm run db:seed`.
2. Ingresar a `/dashboard/admision/nuevo`.
3. Seleccionar paciente y subtipo, completar datos minimos, crear ingreso.
4. Verificar redireccion a ficha `/dashboard/admision/[id]`.
5. Agregar un diagnostico y confirmar persistencia.
6. Agregar un movimiento y confirmar visualizacion.
7. Volver a listado `/dashboard/admision` y buscar por nombre o numero.

---

## Troubleshooting

- Error `Tipo de ingreso ... no valido`:
  - Faltan maestros. Ejecutar `npm run db:seed`.
- Error `Subtipo de admision ... no valido`:
  - Falta subtipo o esta inactivo. Ejecutar seed de subtipos.
- Error de validacion en obra social/plan:
  - Se envio `planId` sin `obraSocialId`.
- El listado no muestra resultados esperados:
  - Revisar filtros (`q`, `tipoIngresoCodigo`, fechas, estado) y paginacion.

---

## Nota de mantenimiento

Si se agrega un nuevo subtipo de admision o cambia una regla de creacion de informes,
actualizar en conjunto:

- `prisma/seed-admision-maestros.ts`
- `src/modules/admision/schemas.ts`
- `src/modules/admision/service.ts`
- UI del formulario (`src/components/admision/admision-form.tsx`)
