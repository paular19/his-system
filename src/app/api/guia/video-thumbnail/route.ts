import { NextResponse, type NextRequest } from 'next/server'

const REVALIDATE_SECONDS = 60 * 60 * 24

function esYoutubeIdValido(id: string): boolean {
  return /^[a-zA-Z0-9_-]{6,20}$/.test(id)
}

async function descargarMiniatura(id: string): Promise<Response | null> {
  const fuentes = [
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  ]

  for (const url of fuentes) {
    try {
      const response = await fetch(url, {
        next: { revalidate: REVALIDATE_SECONDS },
      })

      if (!response.ok) continue

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) continue

      return response
    } catch {
      // Intentar siguiente fuente.
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''

  if (!id || !esYoutubeIdValido(id)) {
    return NextResponse.json({ ok: false, error: 'id invalido' }, { status: 400 })
  }

  const miniatura = await descargarMiniatura(id)

  if (!miniatura) {
    return NextResponse.json({ ok: false, error: 'miniatura no disponible' }, { status: 404 })
  }

  const body = await miniatura.arrayBuffer()
  const contentType = miniatura.headers.get('content-type') ?? 'image/jpeg'

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=3600, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=86400`,
    },
  })
}
