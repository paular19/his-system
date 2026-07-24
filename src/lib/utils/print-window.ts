export function abrirVentanaImpresionPendiente(): Window | null {
  if (typeof window === 'undefined') return null

  const popup = window.open('', '_blank')
  if (!popup) return null

  try {
    popup.opener = null
    popup.document.title = 'Preparando impresion'
    popup.document.body.style.margin = '0'
    popup.document.body.style.fontFamily = 'system-ui, -apple-system, Segoe UI, sans-serif'
    popup.document.body.innerHTML =
      '<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;">' +
      '<div style="max-width:460px;text-align:center;border:1px solid #dbeafe;background:#eff6ff;border-radius:12px;padding:20px;">' +
      '<p style="margin:0;font-size:15px;color:#1d4ed8;font-weight:600;">Preparando impresion...</p>' +
      '<p style="margin:8px 0 0 0;font-size:13px;color:#1e3a8a;">La autorizacion se abrira automaticamente en esta pestana.</p>' +
      '</div>' +
      '</div>'
  } catch {
    // Ignore cross-browser popup document access issues.
  }

  return popup
}

export function navegarVentanaImpresion(
  popup: Window | null,
  url: string
): void {
  if (typeof window === 'undefined') return

  if (popup && !popup.closed) {
    try {
      popup.location.href = url
      return
    } catch {
      // Fallback below.
    }
  }

  window.open(url, '_blank')
}

export function cerrarVentanaImpresion(popup: Window | null): void {
  if (!popup || popup.closed) return
  try {
    popup.close()
  } catch {
    // Ignore close failures.
  }
}
