-- CreateTable
CREATE TABLE "Paciente" (
    "PacID" SERIAL NOT NULL,
    "PacHC" INTEGER,
    "PacApell" VARCHAR(100) NOT NULL,
    "PacNom" VARCHAR(100) NOT NULL,
    "PacNomCom" VARCHAR(200) NOT NULL,
    "PacTipDoc" CHAR(3),
    "PacNroDoc" INTEGER,
    "PacCUIL" DECIMAL(11,0),
    "PacFchNac" TIMESTAMP(6),
    "PacSexo" CHAR(1),
    "PacEstCiv" CHAR(1),
    "PaiID" INTEGER,
    "PfeID" INTEGER,
    "PacDomic" VARCHAR(200),
    "PrvID" INTEGER,
    "LodID" INTEGER,
    "BarID" INTEGER,
    "PacTelef" VARCHAR(50),
    "PacTelLab" VARCHAR(50),
    "PacTelCel1" VARCHAR(50),
    "PacTelCel2" VARCHAR(50),
    "PacEmail" VARCHAR(100),
    "OSID" INTEGER,
    "PosID" INTEGER,
    "PacOSNroAf" VARCHAR(50),
    "OSIDCoseguro" INTEGER,
    "PacTutor" VARCHAR(100),
    "PacTutTelef" VARCHAR(50),
    "PacTutEmpleo" VARCHAR(100),
    "PacObser" TEXT,
    "UsuCodig" CHAR(10) NOT NULL,
    "PacFchIni" TIMESTAMP(6) NOT NULL,
    "PacFchEst" TIMESTAMP(6) NOT NULL,
    "GraID" INTEGER,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("PacID")
);

-- CreateTable
CREATE TABLE "PacienteHis" (
    "PacHisID" SERIAL NOT NULL,
    "PacID" INTEGER NOT NULL,
    "PacHisTipoCambio" CHAR(1) NOT NULL,
    "PacHisUsuCambio" CHAR(10) NOT NULL,
    "PacHisFchCambio" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "PacienteHis_pkey" PRIMARY KEY ("PacHisID")
);

-- CreateTable
CREATE TABLE "Turno" (
    "PrfID" INTEGER NOT NULL,
    "TurFecha" TIMESTAMP(6) NOT NULL,
    "TTuCodig" CHAR(5),
    "TurDurTur" SMALLINT,
    "PacID" INTEGER,
    "TdoCodig" CHAR(3),
    "PacNroDoc" INTEGER,
    "TurPacNom" VARCHAR(200),
    "TurTelef" VARCHAR(50),
    "TurEmail" VARCHAR(100),
    "OSID" INTEGER,
    "PosID" INTEGER,
    "OSCodigCoseguro" INTEGER,
    "TurOSNroAf" VARCHAR(50),
    "TurEstad" CHAR(1),
    "TurFchEst" TIMESTAMP(6),
    "TurFchSol" TIMESTAMP(6),
    "TurFchLlego" TIMESTAMP(6),
    "TurFchAten" TIMESTAMP(6),
    "TurUsuSol" CHAR(10),
    "TurUsuLlego" CHAR(10),
    "TurUsuAten" CHAR(10),
    "TurImporte" DECIMAL(18,2),
    "TurImpSenia" DECIMAL(18,2),
    "TurSinCargo" BOOLEAN,
    "TurNroBono" VARCHAR(50),
    "TurNroRef" VARCHAR(50),
    "TurObserv" VARCHAR(500),
    "SedID" INTEGER,
    "UbiID" INTEGER,
    "IngID" INTEGER,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("PrfID","TurFecha")
);

-- CreateTable
CREATE TABLE "TurnoHis" (
    "TurID" SERIAL NOT NULL,
    "PrfID" INTEGER NOT NULL,
    "TurFecha" TIMESTAMP(6) NOT NULL,
    "TurTipoCambio" CHAR(1) NOT NULL,
    "TurUsuCambio" CHAR(10) NOT NULL,
    "TurFchCambio" TIMESTAMP(6),

    CONSTRAINT "TurnoHis_pkey" PRIMARY KEY ("TurID")
);

-- CreateTable
CREATE TABLE "TurnosExtra" (
    "PrfID" INTEGER NOT NULL,
    "TexFecha" TIMESTAMP(6) NOT NULL,
    "TexDurTur" SMALLINT NOT NULL,
    "TexFchSis" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "TurnosExtra_pkey" PRIMARY KEY ("PrfID","TexFecha")
);

-- CreateTable
CREATE TABLE "Ingreso" (
    "IngID" SERIAL NOT NULL,
    "TigCodig" CHAR(3) NOT NULL,
    "IngNro" INTEGER NOT NULL,
    "PacID" INTEGER,
    "IngNom" VARCHAR(200),
    "IngFchNac" TIMESTAMP(6),
    "IngEdad" SMALLINT,
    "IngFchIngreso" TIMESTAMP(6),
    "IngFchEgreso" TIMESTAMP(6),
    "IngFchEgresoPrevista" TIMESTAMP(6),
    "IngFchObito" TIMESTAMP(6),
    "TinCodig" CHAR(3),
    "PatID" INTEGER,
    "IngPatDescrip" VARCHAR(500),
    "IngPatDef" INTEGER,
    "IngPatDefDescrip" VARCHAR(500),
    "MegCodig" CHAR(2),
    "SerID" INTEGER,
    "CamID" INTEGER,
    "TOcuID" INTEGER,
    "SedID" INTEGER,
    "PrfIDGuardia" INTEGER,
    "PrfIDTratante" INTEGER,
    "CenIDDerivante" INTEGER,
    "PrdIDDerivante" INTEGER,
    "OSID" INTEGER,
    "PosID" INTEGER,
    "IngOSNroAf" VARCHAR(50),
    "IngOSGpo" DECIMAL(5,2),
    "IngOSRep" DECIMAL(5,2),
    "IngOSPmi" BOOLEAN,
    "IngOSPmiFchIni" TIMESTAMP(6),
    "IngOSPmiFchFin" TIMESTAMP(6),
    "OSIDCoseg" INTEGER,
    "PosIDCoseg" INTEGER,
    "IngOSNroAfCoseg" VARCHAR(50),
    "IngARTEmp" VARCHAR(100),
    "IngARTEmpCUIT" DECIMAL(11,0),
    "IngARTEmpTel" VARCHAR(50),
    "IngARTEmpDom" VARCHAR(200),
    "IngARTNumSin" VARCHAR(50),
    "IngARTFchSin" TIMESTAMP(6),
    "IngTutor" VARCHAR(100),
    "IngTutTipDoc" CHAR(3),
    "IngTutNroDoc" INTEGER,
    "IngTutEmpleo" VARCHAR(100),
    "IngTutTelef" VARCHAR(50),
    "CtoID" INTEGER,
    "CcdCantidad" DECIMAL(10,2),
    "IngPraNumAut" VARCHAR(50),
    "IngImpSenia" DECIMAL(18,2),
    "IngTurImporte" DECIMAL(18,2),
    "IngSinCargo" BOOLEAN,
    "IngEstad" CHAR(1),
    "IngFchEst" TIMESTAMP(6),
    "IngObser" TEXT,
    "UsuCodig" CHAR(10),
    "GraID" INTEGER,

    CONSTRAINT "Ingreso_pkey" PRIMARY KEY ("IngID")
);

-- CreateTable
CREATE TABLE "IngresoHis" (
    "IngHisID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "IngHisTipoCambio" CHAR(1) NOT NULL,
    "IngHisUsuCambio" CHAR(10) NOT NULL,
    "IngHisFchCambio" TIMESTAMP(6),

    CONSTRAINT "IngresoHis_pkey" PRIMARY KEY ("IngHisID")
);

-- CreateTable
CREATE TABLE "IngresoPatologia" (
    "InpID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "PatID" INTEGER,
    "InpFecha" TIMESTAMP(6) NOT NULL,
    "InpDescrip" VARCHAR(500),
    "InpObs" VARCHAR(500),
    "InpEstado" CHAR(1) NOT NULL,
    "InpFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "IngresoPatologia_pkey" PRIMARY KEY ("InpID")
);

-- CreateTable
CREATE TABLE "MovIngreso" (
    "MinID" SERIAL NOT NULL,
    "IngID" INTEGER,
    "PacID" INTEGER,
    "TmiCodig" CHAR(3) NOT NULL,
    "MinFecha" TIMESTAMP(6),
    "MinFchVto" TIMESTAMP(6),
    "MinConcep" VARCHAR(200),
    "MinSigno" SMALLINT NOT NULL,
    "MinImporte" DECIMAL(18,2) NOT NULL,
    "MinSaldo" DECIMAL(18,2) NOT NULL,
    "MinEstado" CHAR(1) NOT NULL,
    "MinFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "MovIngreso_pkey" PRIMARY KEY ("MinID")
);

-- CreateTable
CREATE TABLE "Profesional" (
    "PrfID" SERIAL NOT NULL,
    "PrfNombre" VARCHAR(200) NOT NULL,
    "PrfMatric" INTEGER,
    "EspID" INTEGER,
    "TpfCodig" CHAR(3),
    "PrfDomic" VARCHAR(200),
    "PrvID" INTEGER,
    "LodID" INTEGER,
    "PrfCP" VARCHAR(10),
    "PrfTelef" VARCHAR(50),
    "PrfTelCel" VARCHAR(50),
    "PrfEmail" VARCHAR(100),
    "PrfEstad" CHAR(1) NOT NULL,
    "PrfFchEst" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "Profesional_pkey" PRIMARY KEY ("PrfID")
);

-- CreateTable
CREATE TABLE "Cama" (
    "CamID" SERIAL NOT NULL,
    "CamIdentif" VARCHAR(20) NOT NULL,
    "CamHabitacion" VARCHAR(50),
    "CamSector" VARCHAR(30) NOT NULL,
    "CamEstado" VARCHAR(20) NOT NULL,
    "CamObservaciones" VARCHAR(500),
    "SedID" INTEGER,
    "UsuCodig" CHAR(10) NOT NULL,
    "CamFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "Cama_pkey" PRIMARY KEY ("CamID")
);

-- CreateTable
CREATE TABLE "InformeHosp" (
    "InhID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "InhFecha" TIMESTAMP(6) NOT NULL,
    "InhNroRef" VARCHAR(50),
    "PrfIDEfector" INTEGER,
    "PrfIDPrescriptor" INTEGER,
    "InhEstado" CHAR(1) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,
    "InhFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "InformeHosp_pkey" PRIMARY KEY ("InhID")
);

-- CreateTable
CREATE TABLE "SubtipoAdmision" (
    "SAdCodig" CHAR(3) NOT NULL,
    "SAdDescrip" VARCHAR(100) NOT NULL,
    "SAdEstado" CHAR(1) NOT NULL DEFAULT 'A',
    "UsuCodig" CHAR(10) NOT NULL,
    "SAdFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "SubtipoAdmision_pkey" PRIMARY KEY ("SAdCodig")
);

-- CreateTable
CREATE TABLE "IngresoSubtipo" (
    "InSuID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "SAdCodig" CHAR(3) NOT NULL,
    "PrfID" INTEGER,
    "PrfIDTurno" INTEGER,
    "TurFecha" TIMESTAMP(6),
    "NPrCodig" VARCHAR(50),
    "CenDerivante" VARCHAR(200),
    "PrfDerNombre" VARCHAR(200),
    "InSuMotDer" VARCHAR(500),
    "InSuDiagDer" VARCHAR(500),
    "PrfIDInd" INTEGER,
    "InSuTipInd" VARCHAR(100),
    "InSuDescInd" VARCHAR(500),
    "UsuCodig" CHAR(10) NOT NULL,
    "InSuFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "IngresoSubtipo_pkey" PRIMARY KEY ("InSuID")
);

-- CreateTable
CREATE TABLE "InformeAmb" (
    "InfAmbID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "InfAmbFecha" TIMESTAMP(6) NOT NULL,
    "InfAmbNroRef" VARCHAR(50),
    "PrfID" INTEGER,
    "InfAmbEstado" CHAR(1) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,
    "InfAmbFchEstado" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "InformeAmb_pkey" PRIMARY KEY ("InfAmbID")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "CmpID" SERIAL NOT NULL,
    "CmpTipo" VARCHAR(30) NOT NULL,
    "CmpNro" VARCHAR(20) NOT NULL,
    "PacID" INTEGER,
    "IngID" INTEGER,
    "CmpFecha" TIMESTAMP(6) NOT NULL,
    "CmpMonto" DECIMAL(18,2) NOT NULL,
    "CmpConcepto" VARCHAR(500) NOT NULL,
    "CmpFormaPago" VARCHAR(50) NOT NULL,
    "CmpEstado" CHAR(1) NOT NULL,
    "CmpFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,
    "CmpObser" VARCHAR(500),

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("CmpID")
);

-- CreateTable
CREATE TABLE "NomPrestacion" (
    "NprID" SERIAL NOT NULL,
    "NprCodig" VARCHAR(20) NOT NULL,
    "NprDescrip" VARCHAR(500) NOT NULL,
    "NprCategoria" VARCHAR(30) NOT NULL,
    "NprValor" DECIMAL(18,2) NOT NULL,
    "NprEstado" CHAR(1) NOT NULL,
    "NprFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "NomPrestacion_pkey" PRIMARY KEY ("NprID")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "AudID" SERIAL NOT NULL,
    "AudUsuario" VARCHAR(100) NOT NULL,
    "AudAccion" VARCHAR(50) NOT NULL,
    "AudEntidad" VARCHAR(100) NOT NULL,
    "AudRegistroID" VARCHAR(50),
    "AudDetalle" TEXT,
    "AudIP" VARCHAR(50),
    "AudUserAgent" VARCHAR(500),
    "AudFecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("AudID")
);

-- CreateTable
CREATE TABLE "Pais" (
    "PaiID" SERIAL NOT NULL,
    "PaiDescrip" VARCHAR(100),
    "PaiCarTel" VARCHAR(5),

    CONSTRAINT "Pais_pkey" PRIMARY KEY ("PaiID")
);

-- CreateTable
CREATE TABLE "Provincia" (
    "PrvID" INTEGER NOT NULL,
    "PrvNom" VARCHAR(100) NOT NULL,
    "PaiID" INTEGER,

    CONSTRAINT "Provincia_pkey" PRIMARY KEY ("PrvID")
);

-- CreateTable
CREATE TABLE "Localidad" (
    "PrvID" INTEGER NOT NULL,
    "LodID" INTEGER NOT NULL,
    "LodDescrip" VARCHAR(100),
    "LodCP" VARCHAR(10),

    CONSTRAINT "Localidad_pkey" PRIMARY KEY ("PrvID","LodID")
);

-- CreateTable
CREATE TABLE "Barrio" (
    "PrvID" INTEGER NOT NULL,
    "LodID" INTEGER NOT NULL,
    "BarID" INTEGER NOT NULL,
    "BarDescrip" VARCHAR(100),

    CONSTRAINT "Barrio_pkey" PRIMARY KEY ("PrvID","LodID","BarID")
);

-- CreateTable
CREATE TABLE "Profesion" (
    "PfeID" SERIAL NOT NULL,
    "PfeDescrip" VARCHAR(100) NOT NULL,

    CONSTRAINT "Profesion_pkey" PRIMARY KEY ("PfeID")
);

-- CreateTable
CREATE TABLE "Parentesco" (
    "ParCodig" INTEGER NOT NULL,
    "ParDescrip" VARCHAR(100),
    "GpaCodig" CHAR(2),

    CONSTRAINT "Parentesco_pkey" PRIMARY KEY ("ParCodig")
);

-- CreateTable
CREATE TABLE "GrupoParentesco" (
    "GpaCodig" CHAR(2) NOT NULL,
    "GpaDescrip" VARCHAR(100),

    CONSTRAINT "GrupoParentesco_pkey" PRIMARY KEY ("GpaCodig")
);

-- CreateTable
CREATE TABLE "TipoIngreso" (
    "TigCodig" CHAR(3) NOT NULL,
    "TigDecrip" VARCHAR(100),
    "TigProxNum" INTEGER NOT NULL,

    CONSTRAINT "TipoIngreso_pkey" PRIMARY KEY ("TigCodig")
);

-- CreateTable
CREATE TABLE "TipoInternacion" (
    "TinCodig" CHAR(3) NOT NULL,
    "TinDescrip" VARCHAR(100),
    "TinAmbulatorio" BOOLEAN,

    CONSTRAINT "TipoInternacion_pkey" PRIMARY KEY ("TinCodig")
);

-- CreateTable
CREATE TABLE "MotivoEgreso" (
    "MegCodig" CHAR(2) NOT NULL,
    "MegDescrip" VARCHAR(100) NOT NULL,

    CONSTRAINT "MotivoEgreso_pkey" PRIMARY KEY ("MegCodig")
);

-- CreateTable
CREATE TABLE "TipMovIngreso" (
    "TmiCodig" CHAR(3) NOT NULL,
    "TmiDescrip" VARCHAR(100) NOT NULL,
    "TmiSigno" SMALLINT,

    CONSTRAINT "TipMovIngreso_pkey" PRIMARY KEY ("TmiCodig")
);

-- CreateTable
CREATE TABLE "Diagnostico" (
    "DiaID" SERIAL NOT NULL,
    "DiaDescrip" VARCHAR(500),
    "DiaCodCie10" CHAR(10),
    "CCapCodig" INTEGER,
    "CSubCodig" INTEGER,

    CONSTRAINT "Diagnostico_pkey" PRIMARY KEY ("DiaID")
);

-- CreateTable
CREATE TABLE "CIE10Capitulo" (
    "CCapCodig" INTEGER NOT NULL,
    "CCapDescrip" VARCHAR(200) NOT NULL,

    CONSTRAINT "CIE10Capitulo_pkey" PRIMARY KEY ("CCapCodig")
);

-- CreateTable
CREATE TABLE "CIE10Subcapitulo" (
    "CCapCodig" INTEGER NOT NULL,
    "CSubCodig" INTEGER NOT NULL,
    "CSubDescrip" VARCHAR(200) NOT NULL,

    CONSTRAINT "CIE10Subcapitulo_pkey" PRIMARY KEY ("CCapCodig","CSubCodig")
);

-- CreateTable
CREATE TABLE "OSTipoTurno" (
    "OttID" SERIAL NOT NULL,
    "TTuCodig" CHAR(5) NOT NULL,
    "OSID" INTEGER NOT NULL,
    "NprCodig" CHAR(10),

    CONSTRAINT "OSTipoTurno_pkey" PRIMARY KEY ("OttID")
);

-- CreateTable
CREATE TABLE "Form" (
    "ForID" SERIAL NOT NULL,
    "ForDescrip" VARCHAR(200) NOT NULL,
    "ForTipo" CHAR(1),
    "ForEstado" CHAR(1),
    "ForFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10),

    CONSTRAINT "Form_pkey" PRIMARY KEY ("ForID")
);

-- CreateTable
CREATE TABLE "FormDet" (
    "FodID" SERIAL NOT NULL,
    "ForID" INTEGER NOT NULL,
    "FodOrden" INTEGER NOT NULL,
    "FodCampo" VARCHAR(100) NOT NULL,
    "FodDescCampo" VARCHAR(200),
    "FodTipoCampo" VARCHAR(50),
    "FodRequerido" BOOLEAN,

    CONSTRAINT "FormDet_pkey" PRIMARY KEY ("FodID")
);

-- CreateTable
CREATE TABLE "Esquema" (
    "EsqID" SERIAL NOT NULL,
    "EsqDescrip" VARCHAR(200),
    "TEsqID" INTEGER NOT NULL,
    "EsqGenero" CHAR(1),
    "EsqEdadIni" INTEGER,
    "EsqEdadFin" INTEGER,
    "EsqEstado" CHAR(1),
    "EsqFchEstado" TIMESTAMP(6),
    "UsuCodig" CHAR(10),

    CONSTRAINT "Esquema_pkey" PRIMARY KEY ("EsqID")
);

-- CreateTable
CREATE TABLE "EsquemaDet" (
    "EsdID" SERIAL NOT NULL,
    "EsqID" INTEGER NOT NULL,
    "ForID" INTEGER NOT NULL,
    "EsdOrden" INTEGER,
    "EsdDescrip" VARCHAR(200),
    "EsqReq" BOOLEAN,

    CONSTRAINT "EsquemaDet_pkey" PRIMARY KEY ("EsdID")
);

-- CreateTable
CREATE TABLE "PlanOSoc" (
    "OSID" INTEGER NOT NULL,
    "PosID" INTEGER NOT NULL,
    "PosDescrip" VARCHAR(200) NOT NULL,
    "PosNorma" TEXT,
    "PosExportIOSE" CHAR(1),
    "PosCodOld" VARCHAR(50),
    "PosEstado" CHAR(1) NOT NULL,
    "PosFchEstado" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "PlanOSoc_pkey" PRIMARY KEY ("OSID","PosID")
);

-- CreateTable
CREATE TABLE "ObraSocial" (
    "OSID" INTEGER NOT NULL,
    "OSNom" VARCHAR(200) NOT NULL,
    "OSReqCoseg" CHAR(1),
    "OSEstad" CHAR(1) NOT NULL,
    "OSFchEst" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ObraSocial_pkey" PRIMARY KEY ("OSID")
);

-- CreateTable
CREATE TABLE "Orden" (
    "PueNum" INTEGER NOT NULL,
    "OrdNum" INTEGER NOT NULL,
    "IngID" INTEGER,
    "OrdDescrip" VARCHAR(255),
    "OrdFchEmi" TIMESTAMP(6) NOT NULL,
    "OrdFchPed" TIMESTAMP(6) NOT NULL,
    "OrdNumAut" VARCHAR(15),
    "PacID" INTEGER,
    "OrdNom" VARCHAR(50) NOT NULL,
    "OrdNumAfil" VARCHAR(30) NOT NULL,
    "OSID" INTEGER NOT NULL,
    "PosID" INTEGER NOT NULL,
    "OSIDCoseg" INTEGER,
    "PosIDCoseg" INTEGER,
    "PrfID" INTEGER NOT NULL,
    "TorCodig" CHAR(3) NOT NULL,
    "PatID" INTEGER,
    "OrdPatDescrip" VARCHAR(300),
    "OrdImpTotal" DECIMAL(12,2),
    "OprImpCargoPac" DECIMAL(12,2),
    "OrdEstad" CHAR(1) NOT NULL,
    "OrdFchEst" TIMESTAMP(6) NOT NULL,
    "UsuCodig" CHAR(10) NOT NULL,

    CONSTRAINT "Orden_pkey" PRIMARY KEY ("PueNum","OrdNum")
);

-- CreateTable
CREATE TABLE "OrdenPrac" (
    "PueNum" INTEGER NOT NULL,
    "OrdNum" INTEGER NOT NULL,
    "OprItem" INTEGER NOT NULL,
    "NConCodig" INTEGER NOT NULL,
    "NPrCodig" CHAR(8) NOT NULL,
    "NConCodigValor" INTEGER,
    "NpfCodig" CHAR(3),
    "OprNumAut" VARCHAR(15),
    "OprFch" TIMESTAMP(6) NOT NULL,
    "OprCant" DECIMAL(8,2) NOT NULL,
    "OprCantModInt" DECIMAL(5,2),
    "OprImpTotal" DECIMAL(12,2),
    "OprImpCargoPac" DECIMAL(12,2),
    "OprPorcenCargoPac" DECIMAL(5,2),
    "OprTipFact" CHAR(1) NOT NULL,
    "OprModulo" CHAR(8),
    "PraID" INTEGER,

    CONSTRAINT "OrdenPrac_pkey" PRIMARY KEY ("PueNum","OrdNum","OprItem")
);

-- CreateTable
CREATE TABLE "Practica" (
    "PraID" SERIAL NOT NULL,
    "IngID" INTEGER NOT NULL,
    "NConCodig" INTEGER NOT NULL,
    "NPrCodig" CHAR(8) NOT NULL,
    "NConCodigValor" INTEGER NOT NULL,
    "PraFch" TIMESTAMP(6) NOT NULL,
    "PraCant" DECIMAL(8,2) NOT NULL,
    "PraNumAut" VARCHAR(50),
    "OSID" INTEGER,
    "PosID" INTEGER,
    "PraFacturar" BOOLEAN NOT NULL,
    "PraMotNoFact" CHAR(2),
    "PraImpTotal" DECIMAL(12,2),
    "PueNum" INTEGER,
    "OrdNum" INTEGER,
    "OprItem" INTEGER,
    "PraEstad" CHAR(1),
    "UsuCodig" CHAR(10) NOT NULL,
    "PraFchUsu" TIMESTAMP(6),

    CONSTRAINT "Practica_pkey" PRIMARY KEY ("PraID")
);

-- CreateTable
CREATE TABLE "TipoOrden" (
    "TorCodig" CHAR(3) NOT NULL,
    "TorDescrip" VARCHAR(100) NOT NULL,

    CONSTRAINT "TipoOrden_pkey" PRIMARY KEY ("TorCodig")
);

-- CreateTable
CREATE TABLE "NPractica" (
    "NConCodig" INTEGER NOT NULL,
    "NPrCodig" CHAR(8) NOT NULL,
    "NPrDescrip" VARCHAR(500) NOT NULL,
    "NcpCodig" CHAR(5),

    CONSTRAINT "NPractica_pkey" PRIMARY KEY ("NConCodig","NPrCodig")
);

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_PacHC_key" ON "Paciente"("PacHC");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_PacNroDoc_key" ON "Paciente"("PacNroDoc");

-- CreateIndex
CREATE INDEX "Paciente_PacNroDoc_idx" ON "Paciente"("PacNroDoc");

-- CreateIndex
CREATE INDEX "Paciente_PacApell_PacNom_idx" ON "Paciente"("PacApell", "PacNom");

-- CreateIndex
CREATE INDEX "Turno_PacID_idx" ON "Turno"("PacID");

-- CreateIndex
CREATE INDEX "Turno_TurFecha_idx" ON "Turno"("TurFecha");

-- CreateIndex
CREATE INDEX "Turno_TurEstad_idx" ON "Turno"("TurEstad");

-- CreateIndex
CREATE INDEX "Ingreso_PacID_idx" ON "Ingreso"("PacID");

-- CreateIndex
CREATE INDEX "Ingreso_IngFchIngreso_idx" ON "Ingreso"("IngFchIngreso");

-- CreateIndex
CREATE INDEX "Ingreso_IngEstad_idx" ON "Ingreso"("IngEstad");

-- CreateIndex
CREATE UNIQUE INDEX "Ingreso_TigCodig_IngNro_key" ON "Ingreso"("TigCodig", "IngNro");

-- CreateIndex
CREATE INDEX "MovIngreso_IngID_idx" ON "MovIngreso"("IngID");

-- CreateIndex
CREATE INDEX "MovIngreso_PacID_idx" ON "MovIngreso"("PacID");

-- CreateIndex
CREATE INDEX "Cama_CamEstado_idx" ON "Cama"("CamEstado");

-- CreateIndex
CREATE INDEX "Cama_CamSector_idx" ON "Cama"("CamSector");

-- CreateIndex
CREATE INDEX "InformeHosp_IngID_idx" ON "InformeHosp"("IngID");

-- CreateIndex
CREATE UNIQUE INDEX "IngresoSubtipo_IngID_key" ON "IngresoSubtipo"("IngID");

-- CreateIndex
CREATE INDEX "IngresoSubtipo_SAdCodig_idx" ON "IngresoSubtipo"("SAdCodig");

-- CreateIndex
CREATE UNIQUE INDEX "InformeAmb_IngID_key" ON "InformeAmb"("IngID");

-- CreateIndex
CREATE INDEX "InformeAmb_IngID_idx" ON "InformeAmb"("IngID");

-- CreateIndex
CREATE INDEX "Comprobante_PacID_idx" ON "Comprobante"("PacID");

-- CreateIndex
CREATE INDEX "Comprobante_CmpFecha_idx" ON "Comprobante"("CmpFecha");

-- CreateIndex
CREATE INDEX "Comprobante_CmpTipo_idx" ON "Comprobante"("CmpTipo");

-- CreateIndex
CREATE UNIQUE INDEX "NomPrestacion_NprCodig_key" ON "NomPrestacion"("NprCodig");

-- CreateIndex
CREATE INDEX "NomPrestacion_NprCategoria_idx" ON "NomPrestacion"("NprCategoria");

-- CreateIndex
CREATE INDEX "NomPrestacion_NprCodig_idx" ON "NomPrestacion"("NprCodig");

-- CreateIndex
CREATE INDEX "AuditLog_AudUsuario_idx" ON "AuditLog"("AudUsuario");

-- CreateIndex
CREATE INDEX "AuditLog_AudEntidad_idx" ON "AuditLog"("AudEntidad");

-- CreateIndex
CREATE INDEX "AuditLog_AudFecha_idx" ON "AuditLog"("AudFecha");

-- CreateIndex
CREATE INDEX "PlanOSoc_PosEstado_idx" ON "PlanOSoc"("PosEstado");

-- CreateIndex
CREATE INDEX "Orden_IngID_idx" ON "Orden"("IngID");

-- CreateIndex
CREATE INDEX "Orden_OrdEstad_idx" ON "Orden"("OrdEstad");

-- CreateIndex
CREATE INDEX "Orden_OrdFchEmi_idx" ON "Orden"("OrdFchEmi");

-- CreateIndex
CREATE INDEX "OrdenPrac_PraID_idx" ON "OrdenPrac"("PraID");

-- CreateIndex
CREATE INDEX "Practica_IngID_idx" ON "Practica"("IngID");

-- CreateIndex
CREATE INDEX "Practica_PraFch_idx" ON "Practica"("PraFch");

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_PaiID_fkey" FOREIGN KEY ("PaiID") REFERENCES "Pais"("PaiID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_PrvID_fkey" FOREIGN KEY ("PrvID") REFERENCES "Provincia"("PrvID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_PrvID_LodID_fkey" FOREIGN KEY ("PrvID", "LodID") REFERENCES "Localidad"("PrvID", "LodID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_PrvID_LodID_BarID_fkey" FOREIGN KEY ("PrvID", "LodID", "BarID") REFERENCES "Barrio"("PrvID", "LodID", "BarID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_PfeID_fkey" FOREIGN KEY ("PfeID") REFERENCES "Profesion"("PfeID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_OSID_fkey" FOREIGN KEY ("OSID") REFERENCES "ObraSocial"("OSID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_OSID_PosID_fkey" FOREIGN KEY ("OSID", "PosID") REFERENCES "PlanOSoc"("OSID", "PosID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PacienteHis" ADD CONSTRAINT "PacienteHis_PacID_fkey" FOREIGN KEY ("PacID") REFERENCES "Paciente"("PacID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_PrfID_fkey" FOREIGN KEY ("PrfID") REFERENCES "Profesional"("PrfID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_PacID_fkey" FOREIGN KEY ("PacID") REFERENCES "Paciente"("PacID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_OSID_fkey" FOREIGN KEY ("OSID") REFERENCES "ObraSocial"("OSID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_OSID_PosID_fkey" FOREIGN KEY ("OSID", "PosID") REFERENCES "PlanOSoc"("OSID", "PosID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoHis" ADD CONSTRAINT "TurnoHis_PrfID_TurFecha_fkey" FOREIGN KEY ("PrfID", "TurFecha") REFERENCES "Turno"("PrfID", "TurFecha") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnosExtra" ADD CONSTRAINT "TurnosExtra_PrfID_fkey" FOREIGN KEY ("PrfID") REFERENCES "Profesional"("PrfID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_OSID_fkey" FOREIGN KEY ("OSID") REFERENCES "ObraSocial"("OSID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_OSID_PosID_fkey" FOREIGN KEY ("OSID", "PosID") REFERENCES "PlanOSoc"("OSID", "PosID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_PacID_fkey" FOREIGN KEY ("PacID") REFERENCES "Paciente"("PacID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_TigCodig_fkey" FOREIGN KEY ("TigCodig") REFERENCES "TipoIngreso"("TigCodig") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_TinCodig_fkey" FOREIGN KEY ("TinCodig") REFERENCES "TipoInternacion"("TinCodig") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_MegCodig_fkey" FOREIGN KEY ("MegCodig") REFERENCES "MotivoEgreso"("MegCodig") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_PrfIDGuardia_fkey" FOREIGN KEY ("PrfIDGuardia") REFERENCES "Profesional"("PrfID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_PrfIDTratante_fkey" FOREIGN KEY ("PrfIDTratante") REFERENCES "Profesional"("PrfID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingreso" ADD CONSTRAINT "Ingreso_CamID_fkey" FOREIGN KEY ("CamID") REFERENCES "Cama"("CamID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoHis" ADD CONSTRAINT "IngresoHis_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoPatologia" ADD CONSTRAINT "IngresoPatologia_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovIngreso" ADD CONSTRAINT "MovIngreso_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovIngreso" ADD CONSTRAINT "MovIngreso_PacID_fkey" FOREIGN KEY ("PacID") REFERENCES "Paciente"("PacID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovIngreso" ADD CONSTRAINT "MovIngreso_TmiCodig_fkey" FOREIGN KEY ("TmiCodig") REFERENCES "TipMovIngreso"("TmiCodig") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeHosp" ADD CONSTRAINT "InformeHosp_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeHosp" ADD CONSTRAINT "InformeHosp_PrfIDEfector_fkey" FOREIGN KEY ("PrfIDEfector") REFERENCES "Profesional"("PrfID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeHosp" ADD CONSTRAINT "InformeHosp_PrfIDPrescriptor_fkey" FOREIGN KEY ("PrfIDPrescriptor") REFERENCES "Profesional"("PrfID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoSubtipo" ADD CONSTRAINT "IngresoSubtipo_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngresoSubtipo" ADD CONSTRAINT "IngresoSubtipo_SAdCodig_fkey" FOREIGN KEY ("SAdCodig") REFERENCES "SubtipoAdmision"("SAdCodig") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformeAmb" ADD CONSTRAINT "InformeAmb_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provincia" ADD CONSTRAINT "Provincia_PaiID_fkey" FOREIGN KEY ("PaiID") REFERENCES "Pais"("PaiID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Localidad" ADD CONSTRAINT "Localidad_PrvID_fkey" FOREIGN KEY ("PrvID") REFERENCES "Provincia"("PrvID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barrio" ADD CONSTRAINT "Barrio_PrvID_LodID_fkey" FOREIGN KEY ("PrvID", "LodID") REFERENCES "Localidad"("PrvID", "LodID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parentesco" ADD CONSTRAINT "Parentesco_GpaCodig_fkey" FOREIGN KEY ("GpaCodig") REFERENCES "GrupoParentesco"("GpaCodig") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnostico" ADD CONSTRAINT "Diagnostico_CCapCodig_fkey" FOREIGN KEY ("CCapCodig") REFERENCES "CIE10Capitulo"("CCapCodig") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnostico" ADD CONSTRAINT "Diagnostico_CCapCodig_CSubCodig_fkey" FOREIGN KEY ("CCapCodig", "CSubCodig") REFERENCES "CIE10Subcapitulo"("CCapCodig", "CSubCodig") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CIE10Subcapitulo" ADD CONSTRAINT "CIE10Subcapitulo_CCapCodig_fkey" FOREIGN KEY ("CCapCodig") REFERENCES "CIE10Capitulo"("CCapCodig") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormDet" ADD CONSTRAINT "FormDet_ForID_fkey" FOREIGN KEY ("ForID") REFERENCES "Form"("ForID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsquemaDet" ADD CONSTRAINT "EsquemaDet_EsqID_fkey" FOREIGN KEY ("EsqID") REFERENCES "Esquema"("EsqID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanOSoc" ADD CONSTRAINT "PlanOSoc_OSID_fkey" FOREIGN KEY ("OSID") REFERENCES "ObraSocial"("OSID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_OSID_fkey" FOREIGN KEY ("OSID") REFERENCES "ObraSocial"("OSID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_OSID_PosID_fkey" FOREIGN KEY ("OSID", "PosID") REFERENCES "PlanOSoc"("OSID", "PosID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_PrfID_fkey" FOREIGN KEY ("PrfID") REFERENCES "Profesional"("PrfID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orden" ADD CONSTRAINT "Orden_TorCodig_fkey" FOREIGN KEY ("TorCodig") REFERENCES "TipoOrden"("TorCodig") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPrac" ADD CONSTRAINT "OrdenPrac_PueNum_OrdNum_fkey" FOREIGN KEY ("PueNum", "OrdNum") REFERENCES "Orden"("PueNum", "OrdNum") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPrac" ADD CONSTRAINT "OrdenPrac_PraID_fkey" FOREIGN KEY ("PraID") REFERENCES "Practica"("PraID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenPrac" ADD CONSTRAINT "OrdenPrac_NConCodig_NPrCodig_fkey" FOREIGN KEY ("NConCodig", "NPrCodig") REFERENCES "NPractica"("NConCodig", "NPrCodig") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practica" ADD CONSTRAINT "Practica_IngID_fkey" FOREIGN KEY ("IngID") REFERENCES "Ingreso"("IngID") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practica" ADD CONSTRAINT "Practica_OSID_fkey" FOREIGN KEY ("OSID") REFERENCES "ObraSocial"("OSID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practica" ADD CONSTRAINT "Practica_OSID_PosID_fkey" FOREIGN KEY ("OSID", "PosID") REFERENCES "PlanOSoc"("OSID", "PosID") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Practica" ADD CONSTRAINT "Practica_NConCodig_NPrCodig_fkey" FOREIGN KEY ("NConCodig", "NPrCodig") REFERENCES "NPractica"("NConCodig", "NPrCodig") ON DELETE RESTRICT ON UPDATE CASCADE;
