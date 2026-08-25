# Correcciones manuales sobre la base de produccion

Registro de escrituras hechas por fuera de la app (SQL directo o scripts). **No quedan
en el log de auditoria de Prisma**, asi que este archivo es el unico rastro.

Anotar siempre: fecha, que se toco, por que, y como verificar que quedo bien.

---

## 2026-08-25 — 420303 cobrando el doble (5 registros)

**Reportado por:** Paula, revisando el lote 41 (FLORES SILVIA SUSANA).

**Que estaba mal:** 4 filas del codigo `420303` (INTERCONSULTA ESPECIALIZADA EN
INTERNACION) facturaban 34.000,22 con cantidad 1, cuando el valor correcto es
17.000,11 — un solo honorario. Las otras 210 filas activas del mismo codigo ya
estaban bien.

**Causa:** el nomenclador del 420303 solo trae `NPrValEsp`. El override de
`CODIGOS_HE_CON_OPCION_HA` lo espeja sobre `valorAnestesista` para habilitar la
opcion HA. Con los dos componentes en el mismo numero, la inferencia por importe
empataba entre "HE" y "HA", devolvia null, y null significa practica completa:
sumaba los dos honorarios. Detalle que lo delata: cobraba el componente
anestesista pero no asignaba matricula de anestesista.

**Fix de codigo:** commit `a8912f5` — cuando los candidatos empatan, se desempata
con las matriculas cargadas en la practica (solo especialista -> HE, solo
anestesista -> HA). El fix corrige el calculo de ahi en adelante; no reescribe lo
ya guardado, de ahi esta correccion.

**Registros tocados** (una sola transaccion, cada UPDATE guardado por el valor
actual `= 34000.22`):

| tabla | registro | antes | despues |
|---|---|---|---|
| `OrdenPrac` | ing 153, orden 637 it.2 (pra 1370) | 34.000,22 | 17.000,11 |
| `OrdenPrac` | ing 153, orden 639 it.1 (pra 1371) | 34.000,22 | 17.000,11 |
| `OrdenPrac` | ing 191, orden 706 it.1 (pra 1480) | 34.000,22 | 17.000,11 |
| `OrdenPrac` | ing 192, orden 764 it.1 (pra 1550) | 34.000,22 | 17.000,11 |
| `Orden` | ing 153, orden 637 (`OrdImpTotal`) | 49.149,85 | 32.149,74 |
| `Orden` | ing 153, orden 639 (`OrdImpTotal`) | 34.000,22 | 17.000,11 |
| `Orden` | ing 191, orden 706 (`OrdImpTotal`) | 34.000,22 | 17.000,11 |
| `Orden` | ing 192, orden 764 (`OrdImpTotal`) | 34.000,22 | 17.000,11 |
| `Practica` | 1480 (ARGUELLO), `PraImpTotal` | 34.000,22 | 17.000,11 |

Las cabeceras se recalcularon como suma de sus items — coincidian con la suma
vieja y quedaban inconsistentes si se tocaban solo los items.

**Alcance verificado:** barrido de 1.880 filas de orden en todos los lotes
generados. Los lotes afectados eran el 41 (FLORES, 2 filas) y el 26 (AIMO, 1
fila), los dos en `PEN` — nada facturado con el numero equivocado. Los lotes 8 y
25 tenian las mismas filas pero estan anulados. El ingreso 191 (ARGUELLO) no
estaba en ningun lote todavia.

Ademas: **0 codigos** del nomenclador tienen dos componentes con el mismo valor,
asi que el empate solo podia darse por este override y ningun otro codigo puede
caer en el mismo bug.

**Como verificar que sigue bien:**

```sql
SELECT round(op."OprImpTotal" / nullif(op."OprCant", 0), 2) AS unitario, count(*)
FROM "Orden" o
JOIN "OrdenPrac" op ON op."PueNum" = o."PueNum" AND op."OrdNum" = o."OrdNum"
WHERE trim(op."NPrCodig") = '420303' AND o."OrdEstad" <> 'X'
GROUP BY 1 ORDER BY 1;
```

Tiene que dar una sola fila en 17.000,11. Cualquier fila en 34.000,22 significa
que el bug volvio.

**Nota de entorno:** el query engine de Prisma no logra abrir el 5432 contra Neon
desde la sesion de Claude Code (el server no responde al SSLRequest). El driver
HTTP de Neon (`@neondatabase/serverless`, sale por 443) si funciona y fue el que
se uso. Las lecturas de auditoria salieron por ahi tambien.

---

## 2026-08-25 — Verificacion del fix del 420303 (paciente de prueba)

Antes de borrar el paciente de prueba queda anotado lo que mostraba, porque es la
evidencia de que el fix del commit `a8912f5` quedo bien en produccion.

Paciente `ZZTEST, CANTIDADES` (PacID 68391), ingreso 516 ambulatorio, cargado el
2026-08-25 21:16 para reproducir el caso reportado en el lote 41:

| orden | codigo | cantidad | importe | esperado |
|---|---|---|---|---|
| 2563 | 420301 | 2 | 34.000,22 | correcto — 2 x 17.000,11 |
| 2564 | 420303 | 1 | **17.000,11** | correcto — un solo honorario |

Las dos practicas con `PraMatEsp = 9110` y `PraMatAne` en null. Antes del fix esa
combinacion caia en el empate "HE"/"HA" y el 420303 salia 34.000,22; con el
desempate por matricula sale 17.000,11.

---

## 2026-08-25 — Borrado del paciente de prueba ZZTEST

**Que se borro:** el paciente 68391 y todo lo que colgaba de el, en una
transaccion y en orden de FK.

| tabla | filas |
|---|---|
| `OrdenPrac` | 2 |
| `Orden` | 2 |
| `Practica` | 2 |
| `InformeAmb` | 1 |
| `IngresoSubtipo` | 1 |
| `Ingreso` | 1 (ingreso 516) |
| `Paciente` | 1 (PacID 68391) |

**Guardas del script:** aborta si el `PacNomCom` del 68391 no contiene "ZZTEST", y
aborta si el ingreso 516 aparece en algun `LoteFacturacionItem`. No estaba en
ningun lote, asi que no se toco ninguna facturacion.

**Verificacion:** 0 pacientes con ZZTEST en apellido, nombre o nombre completo.
