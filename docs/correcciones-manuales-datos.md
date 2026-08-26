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

---

## 2026-08-26 — Ingresos sin obra social que no se podian facturar

**Sintoma reportado:** MAIDANA, ROBERTO NARCISO — ambulatorio AMB-223 (IngID 368).
Se tildaba la practica en el panel de facturacion y no la tomaba.

**Causa:** el ingreso tenia `Ingreso.OSID` nulo aunque su orden 1-1707 si tenia
OSID=1 / PosID=1. `cargarOrdenesDesdePrestaciones` cortaba en
`src/modules/facturacion/repository.ts:3330` con "El ingreso no tiene obra social
cargada". Ademas, con `OSID` nulo el ingreso tampoco entraba en el lote de IPSS
(`repository.ts:5492` filtra `whereIngreso.obraSocialId = data.obraSocialId`).

El ingreso quedo sin obra social porque al admitir, `admision-form.tsx` marca
"Paciente particular" automaticamente cuando la ficha del paciente no tiene OS
(`const esParticular = !p.obraSocialId`), deshabilita el combo y guarda el ingreso
con `obraSocialId: null` sin avisar. El audit del alta del 368 (AudID 41603, 2026-08-15
12:14) muestra `"obraSocialId":null`; la ficha del paciente 68346 recien recibio
`obraSocialId: 1` el 2026-08-26 12:47 (AudID 62745), pero eso no reescribe el ingreso.

**Que se corrigio:** los 10 ingresos con `OSID` nulo que ya tenian orden generada.
Cada uno hereda la OS y el plan de su propia orden — en los 10 casos, unanime
OSID=1 (IPSS) / PosID=1.

| IngID | tipo | nro | paciente | practicas | ordenes |
|---|---|---|---|---|---|
| 346 | INT | 173 | BENITEZ, CATALINA | 37 | 6 |
| 364 | INT | 177 | BENITEZ, CATALINA | 25 | 21 |
| 368 | AMB | 223 | MAIDANA, ROBERTO NARCISO | 1 | 1 |
| 369 | AMB | 224 | LEEM, BUGUN SEAN | 1 | 1 |
| 434 | AMB | 267 | PUCA, WALTER TOMAS | 6 | 1 |
| 448 | AMB | 280 | ANGEL, ENRIQUE AMADEO | 1 | 1 |
| 454 | AMB | 283 | VILTE FERNANDA JAZMIN | 2 | 1 |
| 464 | AMB | 289 | RIOS MELANI MAGALI | 1 | 1 |
| 469 | AMB | 292 | ALEMAN, ANA INES | 2 | 1 |
| 513 | INT | 229 | RODRIGUEZ, CARLOS JOSE | 2 | 3 |

```sql
update "Ingreso" i
   set "OSID" = o."OSID", "PosID" = o."PosID"
  from (select distinct on ("IngID") "IngID","OSID","PosID"
          from "Orden" where "IngID" = any($1::int[]) order by "IngID","OrdNum") o
 where i."IngID" = o."IngID" and i."IngID" = any($1::int[]) and i."OSID" is null
```

10 filas actualizadas. Ninguna practica estaba facturada (`PraEstad='F'` = 0 en los
10), asi que no se toco ningun importe ni lote ya armado.

**Verificacion:** quedan 9 ingresos con `OSID` nulo (7 AMB, 2 INT) y **0** de ellos
tiene ordenes, o sea ninguno esta bloqueado para facturar. No se tocaron: no hay de
donde deducirles la cobertura.

**Prevencion:** `crearOrdenInterna` (`src/modules/orden/repository.ts`) ahora, dentro
de la misma transaccion, copia la OS y el plan de la orden al ingreso cuando el
ingreso no tiene ninguna (`updateMany` con `obraSocialId: null` en el where, asi
nunca pisa una cobertura ya cargada).

**Pendiente (no tocado):** el default de "Paciente particular" en
`src/components/admision/admision-form.tsx:122` y `:298`. 22.654 de 54.253 pacientes
(42%) no tienen OS en su ficha — todos ellos se admiten como particular en silencio.
Cambiar ese default es decision de negocio, no un fix mecanico.

---

## 2026-08-26 — MAMANI: sutura partida en dos ordenes que no se podia facturar

**Reportado por:** Paula, sobre `/dashboard/facturacion?numeroOrden=1747&ingresoId=360`.

**Que estaba mal:** el ingreso 360 (INT-176, MAMANI MIGUEL ANGEL) tenia UNA sola
`Practica` del codigo 130110 (SUTURA DE HERIDA, PraID 2973) y DOS ordenes activas
apuntando a ella: la 1747 (HONORARIO ESPECIALISTA, autorizacion 52296834) y la 1748
(DERECHOS, autorizacion 52296873). Facturacion vincula una practica a un solo item de
orden (`resolverVinculosOrdenExistenteFacturacion`, `Map` con clave `practicaId`) y
`Practica` guarda un unico `(PueNum, OrdNum, OprItem)`: solo entraba una de las dos y
la otra quedaba muerta. La practica nunca se pudo facturar (`PraEstad` null).

Ademas las dos ordenes tenian el importe **completo** de la practica (81.579,56 cada
una, 163.159,12 sumadas) en vez de su componente. El prorrateo por subitem entro con
el commit `619c914` (18/08 20:09) y estas ordenes se crearon el 18/08 13:13.

**Que se hizo:** se partio la practica en una fila por componente.

| | PraID | componente | autorizacion | importe | orden |
|---|---|---|---|---|---|
| original | 2973 | HE | 52296834 | 21.930,22 | 1747 |
| nueva | 4208 | GA | 52296873 | 59.649,34 | 1748 |

Los importes salen del nomenclador de 130110 convenio 1 (`NPrValEsp` 21.930,22 +
`NPrValGto` 59.649,34 = 81.579,56, el total que tenia la practica).

Tambien se completo `OprModulo` (estaba null en los dos items) con el componente que
ya traia `OprClasAgrup`, y se bajo `OrdImpTotal` de cada orden a su componente.

**Verificacion:** 0 practicas del ingreso 360 con mas de una orden. La suma de las
ordenes activas del ingreso da 809.253,14 = 727.673,58 (lo ya facturado, que es lo que
el lote 41 tiene guardado para MAMANI) + 81.579,56 (la sutura, todavia sin facturar) +
0,00 (orden 1745, protocolo de laboratorio). El lote 41 (PEN) no se toco: la sutura
nunca estuvo adentro.

**Prevencion:** `generarOrdenesDesdeInternacionAction` (`src/modules/orden/actions/`)
ahora crea una fila de `Practica` por componente cuando parte una practica por
subitem, prorratea tambien el importe de la practica original, y escribe el componente
en `incluyeCodigo` (`OprModulo`) del item.

**Pendiente:** quedan **37 casos** con la misma estructura (una practica, varias
ordenes por componente), ninguno facturado. Solo uno mas esta en un lote pendiente:
ingreso 258 (INT-147, TORRES PAULINA) en el lote 43. En 34 de los 37 los importes ya
estan bien repartidos y solo falta el corte; los que ademas necesitan prorrateo son
PraID 3081 (ing. 282), 3059 y 3060 (ing. 400).

Tres casos aparte, que no son de este bug y no se tocaron:

- ing. 467 (BURGOS, 721012): la practica vale 2.117.380,72 pero solo tiene ordenes HE,
  HA y GA, que suman 1.922.871,67. Falta la orden del ayudante, 194.509,05.
- ing. 470 (VALENCIA, 100404): hay ordenes de anestesista y ayudante en 0,00; el
  nomenclador de ese codigo no trae esos componentes.
- ing. 258 (TORRES, 80720): la practica guarda 537.356,26 (solo el gasto) y sus tres
  ordenes suman 1.134.362,66.

---

## 2026-08-26 — Componente de cirugia guardado sin multiplicar por la cantidad

**Sintoma detectado por la usuaria:** el monto de la orden por escision de escaras de
ROSALES HECTOR BENITO (ingreso 241, lote 43) no cerraba contra el nomenclador.

**Causa:** cuando una practica se parte en subitems (GA/HE/HA/A1) y se carga con
`cantidad > 1`, la ruta de carga desde cirugia guardaba en `Practica.importeTotal` el
valor **unitario** del componente, sin multiplicar
(`src/modules/internacion/repository.ts`, `importeTotal: p.importeTotal ?? null`).

Al facturar, `inferirIncluyeCodigoDesdeImporte`
(`src/modules/facturacion/repository.ts`) divide ese importe por la cantidad para
adivinar que componente es. Con cantidad 2 el objetivo queda a la mitad, no matchea
ningun componente, devuelve `null`, y el fallback trataba la fila como **practica
completa**: facturaba `(esp+ayu+ane+gto) x cantidad`.

**Alcance medido:** 858 practicas con `cantidad > 1` y desglose. **14 rotas** (11
nacieron mal al crear, 3 al editar la cantidad). De esas, 2 ya se habian facturado
infladas, las dos de ROSALES: ordenes 1685 y 1687 a 865.715,24 cada una, cuando
correspondian 46.644,08 (HE) y 483.018,68 (GA). Sobrefacturacion: **1.201.767,72**.
Las otras 12 sub-facturaban.

**Correccion aplicada** (script `tmp-corregir-componentes.ts`, ya borrado):

- 14 `Practica.PraImpTotal` = componente unitario x cantidad.
- 14 renglones de `OrdenPrac.OprImpTotal` en 13 ordenes activas.
- 13 `Orden.OrdImpTotal` recalculados como suma de sus renglones.
- 2 `LoteFacturacionItem.LItImpTotal` ajustados **por diferencia** (no recalculados
  desde cero: el reparto por categoria y las ordenes tomadas por otros lotes las
  decide la app al armar el lote).
- Totales de los lotes 43 y 30, ambos PEN. Ningun lote confirmado quedo afectado.

Incluye revertir la edicion manual del 2026-08-25 sobre la practica 2691, a la que le
habian puesto el total de la practica (865.715,24) en un renglon que es solo HE.

| lote | antes | despues |
|---|---|---|
| 43 (ACIDSAL) | 34.325.721,57 | 32.882.444,51 |
| 30 (OSECAC) | 79.933,09 | 86.845,29 |

**Verificacion:** 0 practicas con el patron roto entre las corregidas; 0 cabeceras de
orden descuadradas contra sus renglones (13 de 13); las escaras de ROSALES dan
865.715,24 por cirugia, 1.731.430,48 en total, contra 3.174.707,54 antes; el total de
cada lote coincide con la suma de sus items.

**ROSALES tiene 2 cirugias reales** (confirmado por la usuaria): los dos juegos de
ordenes 1586-1589 y 1685-1688 son legitimos. El tercer juego de practicas
(2848-2851) ya estaba anulado.

**Prevencion:** la carga desde cirugia ahora multiplica por la cantidad, el campo del
payload pasa a llamarse `importeBaseUnitario` para que la semantica sea explicita, y
la facturacion (a) reintenta la inferencia contra el importe crudo para leer bien las
cargas viejas y (b) nunca cae en "practica completa" cuando no reconoce el componente:
usa el importe guardado.

**No se toco:** la practica 483 (ingreso 68, 80617 x5). Es del paciente de prueba que
se borro — el ingreso quedo con `PacID` en null, sin orden y sin lote.

**Pendiente:** durante la correccion aparecieron 3 practicas nuevas con el mismo bug,
cargadas el mismo 2026-08-26 entre las 16:41 y las 16:58: PraID 4215, 4222 y 4232
(SULCA PASCUALA, ingreso 456, codigo 340907 x4, 10.639,12 en vez de 42.556,48).
Ninguna tiene orden ni lote todavia. El fix de codigo no estaba deployado cuando se
cargaron.

### Anexo del mismo dia — SULCA PASCUALA (ingreso 456)

Mientras se corregia lo anterior aparecieron 4 cargas de `340907` (radioscopia en
quirofano) x4 para el ingreso 456, todas entre las 16:41 y las 16:58 del 2026-08-26.
Fueron cuatro intentos: cargar, generar orden, anular, recargar.

| PraID | componente | importe que tenia | su orden |
|---|---|---|---|
| 4215 | HE | 1.769,60 | 2657 anulada |
| 4222 | HE | 1.769,60 | 2661 anulada |
| 4225 | GA | 42.556,48 (correcto) | 2667 anulada |
| 4232 | GA | 10.639,12 | 2670 **activa** |

No habia duplicacion facturable: de los cuatro intentos sobrevive uno solo.

Corregido: `PraImpTotal` de 4215 y 4222 a 7.078,40 y de 4232 a 42.556,48; el renglon
2670/2 de 10.639,12 a 42.556,48; la cabecera de la orden 2670 de 431.094,33 a
463.011,69. El ingreso no esta en ningun lote. La practica 4225 no se toco: ya estaba
bien.

Estas ordenes no las genera la ruta de facturacion sino
`generarOrdenesDesdeInternacionAction`, que copia `Practica.importeTotal` tal cual, asi
que aca el importe salio corto en vez de inflado.

**Verificacion:** el barrido completo sobre las practicas con `cantidad > 1` no
devuelve ninguna con el patron roto.
