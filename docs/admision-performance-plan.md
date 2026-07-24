# Plan de performance para Admision

## Objetivo
Hacer que admision sea el flujo mas rapido del sistema, priorizando:
- tiempo de busqueda de paciente
- tiempo de creacion de ingreso
- tiempo de carga de ficha de internacion/admision

## KPI iniciales sugeridos
- P95 busqueda de paciente: <= 250 ms
- P95 crear ingreso: <= 450 ms
- P95 abrir ficha luego de crear: <= 700 ms
- error rate: < 0.5%

## Cambios aplicados en esta iteracion
1. Busqueda rapida dedicada para admision:
- endpoint nuevo: /api/pacientes/busqueda-rapida
- sin count y sin joins pesados
- payload minimo para seleccionar paciente y cobertura

2. Menos roundtrips en crear internacion:
- se elimino update redundante de cama luego de crear ingreso
- la cama ya se actualiza dentro de la transaccion de creacion

3. Menor latencia en backend de admision:
- validaciones iniciales paralelizadas en crearIngreso
- paciente, tipoIngreso, subtipo y obraSocial se consultan en paralelo

## Fase 2 (siguiente)
1. Indices y busqueda por prefijos en paciente:
- verificar uso de indices de Paciente por apellido/nombre
- evaluar trgm para busquedas de texto parcial si el volumen crece

2. Cache de lectura para catalogos estaticos:
- mantener catalogos en unstable_cache con tags
- invalidacion explicita en altas de catalogos

3. Pool y observabilidad:
- revisar pool de Prisma en produccion
- medir p50/p95 por endpoint (admision, internacion, pacientes)
- agregar alertas por degradacion de p95

4. Estrategia de concurrencia:
- mantener lock por paciente para evitar dobles internaciones
- agregar metricas de lock-wait para detectar contencion

## Fase 3 (arquitectura)
1. Consolidar endpoint de admision rapido:
- endpoint unico para pre-carga del formulario (paciente + catalogos clave)
- evitar llamadas seriales desde UI

2. Colas para trabajo no critico:
- mover auditoria pesada y tareas no bloqueantes a procesos async cuando aplique
- mantener respuesta del alta enfocada en persistencia principal

3. Guardrails de performance en CI:
- smoke tests de latencia para endpoints criticos
- presupuesto de payload para endpoints de busqueda
