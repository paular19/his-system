# Backup automatico de base de datos de produccion

Este proyecto incluye un workflow en GitHub Actions para generar un backup diario de PostgreSQL de produccion.

## Workflow

- Archivo: `.github/workflows/prod-db-backup.yml`
- Frecuencia: diaria a las 03:00 (hora Argentina)
- Trigger manual: `workflow_dispatch`
- Formato backup: `pg_dump` custom (`.dump`) comprimido
- Verificacion: `pg_restore --list` + checksum `sha256`
- Almacenamiento:
  - Siempre: GitHub Artifact (retencion 30 dias)
  - Opcional: S3 (si estan configurados los secrets)

## Secrets requeridos

Configurar en GitHub repository secrets:

- `PROD_DATABASE_URL` (obligatorio)
- `BACKUP_S3_BUCKET` (opcional)
- `AWS_ACCESS_KEY_ID` (opcional, para S3)
- `AWS_SECRET_ACCESS_KEY` (opcional, para S3)
- `AWS_REGION` (opcional, para S3)

## URL recomendada para backup

Para `PROD_DATABASE_URL`, usar una conexion con SSL y usuario dedicado de backup cuando sea posible.

Ejemplo:

`postgresql://backup_user:password@host:5432/dbname?sslmode=require`

## Restauracion (ejemplo)

Crear una base vacia de restauracion y correr:

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --dbname "postgresql://user:password@host:5432/dbname?sslmode=require" \
  his-prod-YYYYMMDDTHHMMSSZ.dump
```

## Recomendaciones operativas

- Mantener tambien backup nativo del proveedor (PITR en Neon).
- Probar restore al menos una vez por mes.
- Configurar lifecycle policy en el bucket S3 (ejemplo: 90 dias).
- Activar notificaciones de fallo de Actions (mail/Slack).
