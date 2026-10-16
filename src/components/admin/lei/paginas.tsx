"use client"

import { ExternalLink, Search } from "lucide-react"
import { useState, useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { abrirPagina, buscarNasPaginas } from "@/server/legislacao/actions"

type Achado = { pagina: number; metodo: string; trecho: string }
type Pagina = { page_number: number; content: string; method: string; ocr_model: string | null }

/** Busca no texto das páginas e leitura de uma página, com link para a mesma página no PDF. */
export function LeitorPaginas({
  documentoId,
  pdfUrl,
}: {
  documentoId: string
  pdfUrl: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [termo, setTermo] = useState("")
  const [achados, setAchados] = useState<Achado[] | null>(null)
  const [pagina, setPagina] = useState<Pagina | null>(null)
  const [numero, setNumero] = useState("")

  const abrir = (n: number) =>
    startTransition(async () => {
      setPagina((await abrirPagina(documentoId, n)) ?? null)
      setNumero(String(n))
    })

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => setAchados(await buscarNasPaginas(documentoId, termo)))
          }}
        >
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Ex.: parâmetros da ZOP 1"
            aria-label="Buscar no texto das páginas"
          />
          <Button
            type="submit"
            size="icon"
            variant="outline"
            disabled={pending || termo.trim().length < 3}
            aria-label="Buscar"
          >
            <Search aria-hidden />
          </Button>
        </form>
        {achados && (
          <ul className="max-h-96 divide-y overflow-auto rounded-lg border text-sm">
            {achados.length === 0 && (
              <li className="p-3 text-muted-foreground">Nada encontrado.</li>
            )}
            {achados.map((a) => (
              <li key={a.pagina}>
                <button
                  type="button"
                  onClick={() => abrir(a.pagina)}
                  className="w-full p-2 text-left hover:bg-muted"
                >
                  <span className="font-medium">Página {a.pagina}</span>
                  <span className="block text-xs text-muted-foreground">{a.trecho}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const n = Number(numero)
            if (Number.isInteger(n) && n > 0) abrir(n)
          }}
        >
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            inputMode="numeric"
            className="w-24"
            aria-label="Número da página"
            placeholder="Página"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Abrir
          </Button>
          {pagina && pdfUrl && (
            <a
              href={`${pdfUrl}#page=${pagina.page_number}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-sm text-primary"
            >
              Ver no PDF <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </form>
        {pagina ? (
          <div className="space-y-2">
            <Badge variant="outline">
              {pagina.method === "ocr"
                ? `OCR (${pagina.ocr_model})`
                : pagina.method === "texto"
                  ? "Texto do PDF"
                  : "Pendente de OCR"}
            </Badge>
            <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
              {pagina.content || "Sem texto."}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Abra uma página para ver o texto lido.</p>
        )}
      </div>
    </div>
  )
}
