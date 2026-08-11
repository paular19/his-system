'use client'

import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'

interface PdfDownloadButtonProps {
  targetId: string
  filename: string
  label?: string
  className?: string
}

export function PdfDownloadButton({
  targetId,
  filename,
  label = 'Generar PDF',
  className = '',
}: PdfDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleDownload() {
    const element = document.getElementById(targetId)
    if (!element || isGenerating) return

    setIsGenerating(true)
    element.classList.add('pdf-export-sheet')

    try {
      await document.fonts.ready
      const { default: html2pdf } = await import('html2pdf.js')

      await html2pdf()
        .set({
          filename,
          margin: [10, 7, 10, 7],
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .save()
    } catch (error) {
      console.error('No se pudo generar el PDF', error)
      window.alert('No se pudo generar el PDF. Intente nuevamente.')
    } finally {
      element.classList.remove('pdf-export-sheet')
      setIsGenerating(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isGenerating}
      className={className}
    >
      {isGenerating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
      {isGenerating ? 'Generando PDF...' : label}
    </button>
  )
}
