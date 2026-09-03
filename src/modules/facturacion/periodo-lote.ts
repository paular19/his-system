// El periodo de un lote ("2026-08") no es el mes calendario: va del dia 2 del mes
// al dia 1 del mes siguiente inclusive. Agosto cierra el 01/09, asi que las ordenes
// emitidas ese dia se facturan con agosto y no con septiembre.
//
// El corrimiento tiene que estar en las dos puntas: si el periodo arrancara el dia 1
// y cerrara el dia 1 del mes siguiente, ese dia caeria en dos periodos y se podria
// facturar dos veces.
//
//   2026-09  ->  02/09 00:00  hasta  01/10 23:59:59
//   2026-10  ->  02/10 00:00  hasta  01/11 23:59:59

export type RangoPeriodo = { desde: Date; hasta: Date }

// Excepcion, por unica vez: 2026-08 es el primer periodo que se factura con esta regla,
// asi que arranca el 01/08 y no el 02/08 —queda 01/08 00:00 hasta 01/09 23:59:59—.
// El motivo es que el dia 1 corrido deberia caer en el periodo anterior, pero no existe
// ningun lote de 2026-07: si el 01/08 no entra en agosto no lo levanta nadie. Son 21
// ordenes por 7.709.077,23 que al 2026-09-03 no estaban en ningun lote confirmado.
// No se repite en los periodos siguientes, que ya tienen su mes anterior facturado.
const PRIMER_PERIODO_CON_DIA_1 = '2026-08'

// `hasta` es exclusivo: es el 02 del mes siguiente a las 00:00, para que entre
// el dia 1 completo (las fechas de emision llevan hora, no son solo el dia).
export function periodoToDateRange(periodo: string): RangoPeriodo {
    const [yearStr, monthStr] = periodo.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    const diaInicio = periodo === PRIMER_PERIODO_CON_DIA_1 ? 1 : 2
    const desde = new Date(Date.UTC(year, month - 1, diaInicio, 0, 0, 0, 0))
    const hasta = new Date(Date.UTC(year, month, 2, 0, 0, 0, 0))
    return { desde, hasta }
}

// Un lote sin periodo no filtra por fecha: levanta todo lo pendiente. Estos tres
// helpers son la unica forma de leer el periodo de un lote, para que "sin periodo"
// signifique lo mismo al crearlo, al mostrarlo y al aplicarle el promedi.
export function rangoPeriodoOpcional(periodo: string | null | undefined): RangoPeriodo | null {
    if (!periodo) return null
    return periodoToDateRange(periodo)
}

export function fechaEntraEnPeriodo(fecha: Date, rango: RangoPeriodo | null): boolean {
    if (!rango) return true
    return fecha >= rango.desde && fecha < rango.hasta
}
