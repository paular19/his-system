/**
 * Script para asignar roles a usuarios en Clerk por dirección de email.
 *
 * Uso:
 *   node assign-roles.mjs                          → todos los emails del mapa
 *   node assign-roles.mjs a@x.com b@y.com          → solo esos emails
 *   node assign-roles.mjs --dry-run                → muestra qué haría, sin escribir
 *
 * Conviene filtrar: el mapa de abajo y ROLES_POR_EMAIL_REGISTRADOS
 * (src/lib/auth/role-registry.ts) no están sincronizados, y lo que se escribe en
 * Clerk le gana al registro por email. Correr el script entero puede cambiarle el
 * rol a un usuario que no tenías intención de tocar.
 *
 * Requiere la variable de entorno CLERK_SECRET_KEY en .env.local
 *
 * Roles asignados:
 *   OPERADOR    → acceso a todos los módulos excepto facturación
 *   ADMIN       → acceso a todos los módulos incluyendo facturación
 *   FACTURACION → acceso únicamente al módulo de facturación
 *   INTERNACION → acceso únicamente al módulo de internación
 *   FACTURACION_PROFESIONALES → solo la liquidación de honorarios por efector
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar variables de entorno desde .env.local
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local no encontrado, continuar con variables de entorno del sistema
  }
}

loadEnv()

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY
if (!CLERK_SECRET_KEY) {
  console.error('ERROR: CLERK_SECRET_KEY no está definida en .env.local o en el entorno.')
  process.exit(1)
}

// Asignación de roles por email
const ROLES_POR_EMAIL = {
  // INTERNACION
  'cirugiaclinicasr@gmail.com': 'INTERNACION',

  // ADMISION
  'ficacode@gmail.com': 'ADMISION',
  'barrionuevodamarisbelen@gmail.com': 'ADMISION',
  'ivictoria123@hotmail.com': 'ADMISION',
  'eduardogutierrez0770@gmail.com': 'ADMISION',
  'altamirano97.leandro@gmail.com': 'ADMISION',
  'enahirtni@gmail.com': 'ADMISION',
  'lucianolozanoj2@gmail.com': 'ADMISION',
  'ivanagtarcaya78@gmail.com': 'ADMISION',
  'emilio_xeneize_22@hotmail.com.ar': 'ADMISION',

  // OPERADOR: todos los módulos excepto facturación
  'tarosaicha1812@gmail.com': 'OPERADOR',
  'zeballosmonika@gmail.com': 'OPERADOR',

  // ADMIN: todos los módulos + facturación (aparecen en ambas listas)
  'marcelalejandra2015@gmail.com': 'ADMIN',
  'ramospaula1996@gmail.com': 'ADMIN',

  // FACTURACION: acceso al módulo de facturación
  'marianacanaza24@gmail.com': 'FACTURACION',
  'kmontano137@gmail.com': 'FACTURACION',
  'serapiogabriela40@gmail.com': 'FACTURACION',

  // FACTURACION_PROFESIONALES: solo la liquidación de honorarios al efector
  'sanarproveedores@gmail.com': 'FACTURACION_PROFESIONALES',
  'admsanar@gmail.com': 'FACTURACION_PROFESIONALES',
}

async function buscarUsuarioPorEmail(email) {
  const url = `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Error al buscar usuario ${email}: HTTP ${res.status}`)
  }
  const data = await res.json()
  return Array.isArray(data) ? data[0] : null
}

async function asignarRol(userId, rol) {
  const url = `https://api.clerk.com/v1/users/${userId}/metadata`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      public_metadata: { rol },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Error al asignar rol a ${userId}: HTTP ${res.status} - ${body}`)
  }
  return res.json()
}

/** Filtra el mapa por los emails pasados por linea de comandos. Sin emails, devuelve todo. */
function seleccionarObjetivos(argv) {
  const dryRun = argv.includes('--dry-run')
  const emails = argv.filter((a) => !a.startsWith('--')).map((a) => a.trim().toLowerCase())

  if (emails.length === 0) return { dryRun, objetivos: Object.entries(ROLES_POR_EMAIL) }

  const objetivos = []
  for (const email of emails) {
    const entrada = Object.entries(ROLES_POR_EMAIL).find(([e]) => e.toLowerCase() === email)
    if (!entrada) {
      console.error(`ERROR: ${email} no está en ROLES_POR_EMAIL. Agregalo al mapa primero.`)
      process.exit(1)
    }
    objetivos.push(entrada)
  }
  return { dryRun, objetivos }
}

async function main() {
  const { dryRun, objetivos } = seleccionarObjetivos(process.argv.slice(2))

  console.log(
    `${dryRun ? '[DRY-RUN] ' : ''}Asignando roles a ${objetivos.length} usuario(s)` +
    `${objetivos.length < Object.keys(ROLES_POR_EMAIL).length ? ' (filtrado)' : ''}...\n`
  )

  const resultados = { ok: [], noEncontrado: [], error: [] }

  for (const [email, rol] of objetivos) {
    try {
      const usuario = await buscarUsuarioPorEmail(email)
      if (!usuario) {
        console.warn(`  [NO ENCONTRADO] ${email}`)
        resultados.noEncontrado.push(email)
        continue
      }
      const rolActual = usuario.public_metadata?.rol ?? '(sin rol)'
      if (dryRun) {
        console.log(`  [DRY-RUN] ${email}: ${rolActual} → ${rol}`)
        resultados.ok.push({ email, rol })
        continue
      }
      await asignarRol(usuario.id, rol)
      console.log(`  [OK] ${email}: ${rolActual} → ${rol}`)
      resultados.ok.push({ email, rol })
    } catch (err) {
      console.error(`  [ERROR] ${email}: ${err.message}`)
      resultados.error.push({ email, error: err.message })
    }
  }

  console.log('\n=== RESUMEN ===')
  console.log(`  Asignados correctamente : ${resultados.ok.length}`)
  console.log(`  No encontrados en Clerk : ${resultados.noEncontrado.length}`)
  console.log(`  Errores                 : ${resultados.error.length}`)

  if (resultados.noEncontrado.length > 0) {
    console.log('\nUsuarios no encontrados (deben registrarse primero):')
    resultados.noEncontrado.forEach(e => console.log(`  - ${e}`))
  }
  if (resultados.error.length > 0) {
    console.log('\nErrores:')
    resultados.error.forEach(({ email, error }) => console.log(`  - ${email}: ${error}`))
  }
}

main()
