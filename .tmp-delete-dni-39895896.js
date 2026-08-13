const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const dni = 39895896;
  const paciente = await prisma.paciente.findFirst({
    where: { numeroDocumento: dni },
    select: { id: true, nombreCompleto: true, numeroDocumento: true }
  });

  if (!paciente) {
    console.log(JSON.stringify({ ok: true, mensaje: 'Paciente no encontrado', dni }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const ingresoIds = (await prisma.ingreso.findMany({
    where: { pacienteId: paciente.id },
    select: { id: true }
  })).map((i) => i.id);

  const cirugiaIds = (await prisma.cirugiaProgramada.findMany({
    where: { pacienteId: paciente.id },
    select: { id: true }
  })).map((c) => c.id);

  console.log(JSON.stringify({
    ok: true,
    paciente,
    ingresoIds,
    cirugiaIds,
    conteo: {
      ingresos: ingresoIds.length,
      cirugias: cirugiaIds.length,
      ordenes: await prisma.orden.count({ where: { ingresoId: { in: ingresoIds } } }),
      practicas: await prisma.practica.count({ where: { ingresoId: { in: ingresoIds } } })
    }
  }, null, 2));

  await prisma.$transaction(async (tx) => {
    if (cirugiaIds.length > 0) {
      await tx.cirugiaDiferencial.deleteMany({ where: { cirugiaId: { in: cirugiaIds } } });
      await tx.cirugiaPractica.deleteMany({ where: { cirugiaId: { in: cirugiaIds } } });
      await tx.cirugiaProgramada.deleteMany({ where: { id: { in: cirugiaIds } } });
    }

    const turnoRefs = await tx.turno.findMany({
      where: { pacienteId: paciente.id },
      select: { profesionalId: true, fechaTurno: true }
    });

    if (turnoRefs.length > 0) {
      await tx.turnoHistorial.deleteMany({
        where: {
          OR: turnoRefs.map(({ profesionalId, fechaTurno }) => ({ profesionalId, fechaTurno }))
        }
      });
    }

    await tx.pacienteHistorial.deleteMany({ where: { pacienteId: paciente.id } });
    await tx.turno.deleteMany({ where: { pacienteId: paciente.id } });
    await tx.movimientoIngreso.deleteMany({ where: { OR: [{ ingresoId: { in: ingresoIds } }, { pacienteId: paciente.id }] } });
    await tx.electrocardiogramaIngreso.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.ordenPractica.deleteMany({ where: { orden: { ingresoId: { in: ingresoIds } } } });
    await tx.orden.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.practica.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.informeHospitalizacion.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.informeAmbulatorio.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.ingresoSubtipo.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.evolucionIngreso.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.transferenciaIngreso.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.medicacionIngreso.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.descartableIngreso.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.ingresoPatologia.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.ingresoHistorial.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.loteFacturacionItem.deleteMany({ where: { ingresoId: { in: ingresoIds } } });
    await tx.comprobante.deleteMany({ where: { OR: [{ ingresoId: { in: ingresoIds } }, { pacienteId: paciente.id }] } });
    await tx.ingreso.deleteMany({ where: { id: { in: ingresoIds } } });
    await tx.paciente.delete({ where: { id: paciente.id } });
  });

  const pacienteRestante = await prisma.paciente.findFirst({ where: { numeroDocumento: dni } });
  const ingresosRestantes = await prisma.ingreso.count({ where: { pacienteId: paciente.id } });

  console.log(JSON.stringify({
    ok: true,
    eliminado: {
      dni,
      pacienteEliminado: !pacienteRestante,
      ingresosRestantes,
      mensaje: 'Paciente, admisiones y prácticas asociadas eliminados.'
    }
  }, null, 2));

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
