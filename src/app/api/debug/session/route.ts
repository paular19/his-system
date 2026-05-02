import { currentUser } from '@clerk/nextjs/server'
import { getUsuarioSesion } from '@/lib/auth'
import { tienePermiso } from '@/lib/auth/rbac'
import { apiOk, manejarErrorApi } from '@/lib/utils/response'

export async function GET() {
  try {
    const sesion = await getUsuarioSesion()
    const user = await currentUser()

    const publicMetadata = (user?.publicMetadata ?? {}) as Record<string, unknown>
    const unsafeMetadata = ((user as unknown as { unsafeMetadata?: Record<string, unknown> })?.unsafeMetadata ?? {})

    const rolPublicRol = publicMetadata.rol
    const rolPublicRole = publicMetadata.role
    const rolUnsafeRol = unsafeMetadata.rol
    const rolUnsafeRole = unsafeMetadata.role

    return apiOk({
      sesion,
      metadata: {
        publicMetadata: {
          rol: rolPublicRol ?? null,
          role: rolPublicRole ?? null,
          codigoUsuario: publicMetadata.codigoUsuario ?? null,
        },
        unsafeMetadata: {
          rol: rolUnsafeRol ?? null,
          role: rolUnsafeRole ?? null,
          codigoUsuario: unsafeMetadata.codigoUsuario ?? null,
        },
      },
      permisos: {
        facturacionLeer: tienePermiso(sesion.rol, 'FACTURACION', 'LEER'),
        facturacionCrear: tienePermiso(sesion.rol, 'FACTURACION', 'CREAR'),
        facturacionModificar: tienePermiso(sesion.rol, 'FACTURACION', 'MODIFICAR'),
      },
    })
  } catch (error) {
    return manejarErrorApi(error)
  }
}
