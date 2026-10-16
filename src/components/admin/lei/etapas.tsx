"use client"

import { CircleCheck, Circle, Loader2, Square } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatUSD } from "@/lib/format"
import {
  dividirEmTrechos,
  extrairTextoDasPaginas,
  indexarProximosTrechos,
  marcarParaOcr,
  transcreverProximasPaginas,
} from "@/server/legislacao/actions"

import { useEtapa } from "./use-etapa"

type Props = {
  documentoId: string
  totalPaginas: number
  paginas: { texto: number; ocr: number; pendente: number }
  trechos: { total: number; indexados: number }
  voyage: boolean
  custoOcrPendentes: number | null
  /** Páginas que são o texto da norma (o resto do PDF pode ser processo legislativo). */
  paginasDaNorma: string | null
}

function Etapa({
  feita,
  titulo,
  detalhe,
  children,
}: {
  feita: boolean
  titulo: string
  detalhe: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        {feita ? (
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-label="Concluída" />
        ) : (
          <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Pendente" />
        )}
        <div className="space-y-1">
          <p className="font-medium">{titulo}</p>
          <div className="text-sm text-muted-foreground">{detalhe}</div>
        </div>
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>
      )}
    </li>
  )
}

/** As etapas da ingestão, na ordem, cada uma com seu botão. */
export function EtapasIngestao(p: Props) {
  const etapa = useEtapa()
  const [intervalo, setIntervalo] = useState("")
  const [norma, setNorma] = useState(p.paginasDaNorma ?? "")
  const lidas = p.paginas.texto + p.paginas.ocr + p.paginas.pendente

  return (
    <div className="space-y-2">
      {etapa.progresso && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {etapa.progresso}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={etapa.interromper}>
            <Square aria-hidden /> Parar depois deste lote
          </Button>
        </p>
      )}
      <ol className="divide-y">
        <Etapa
          feita={lidas > 0}
          titulo="1. Ler o texto das páginas"
          detalhe={
            lidas > 0
              ? `${p.paginas.texto} com texto · ${p.paginas.ocr} transcritas por OCR · ${p.paginas.pendente} escaneadas pendentes`
              : `${p.totalPaginas} páginas no PDF. Páginas escaneadas ficam marcadas para OCR.`
          }
        >
          <Button
            size="sm"
            variant={lidas > 0 ? "outline" : "default"}
            disabled={etapa.pending}
            onClick={() => {
              if (lidas > 0 && !window.confirm("Ler de novo apaga o OCR já feito. Continuar?"))
                return
              etapa.executar(() => extrairTextoDasPaginas(p.documentoId))
            }}
          >
            {lidas > 0 ? "Ler de novo" : "Ler texto"}
          </Button>
        </Etapa>

        <Etapa
          feita={lidas > 0 && p.paginas.pendente === 0}
          titulo="2. OCR das páginas escaneadas"
          detalhe={
            p.paginas.pendente > 0 ? (
              <>
                {p.paginas.pendente} páginas pendentes · estimativa {formatUSD(p.custoOcrPendentes)}
                . Transcrição fiel pelo modelo, em lotes que retomam de onde pararam.
              </>
            ) : lidas > 0 ? (
              "Nenhuma página pendente."
            ) : (
              "Depois da leitura."
            )
          }
        >
          <Input
            value={intervalo}
            onChange={(e) => setIntervalo(e.target.value)}
            placeholder="Páginas (opcional): 70-90"
            aria-label="Intervalo de páginas para OCR"
            className="h-8 w-44"
          />
          {intervalo && (
            <Button
              size="sm"
              variant="outline"
              disabled={etapa.pending}
              onClick={() => etapa.executar(() => marcarParaOcr(p.documentoId, intervalo))}
              title="Refaz o OCR destas páginas (texto mal lido ou tabela achatada)"
            >
              Refazer estas
            </Button>
          )}
          <Button
            size="sm"
            disabled={etapa.pending || p.paginas.pendente === 0}
            onClick={() =>
              etapa.executar(
                () => transcreverProximasPaginas(p.documentoId, intervalo || undefined),
                {
                  repetir: !intervalo,
                },
              )
            }
          >
            {intervalo ? "OCR do intervalo" : "OCR das pendentes"}
          </Button>
        </Etapa>

        <Etapa
          feita={p.trechos.total > 0}
          titulo="3. Dividir em trechos para a busca"
          detalhe={
            <>
              {p.trechos.total > 0
                ? `${p.trechos.total} trechos (por artigo, com seção e páginas).`
                : "Um trecho por artigo; anexos por tamanho."}{" "}
              Se o PDF traz o processo legislativo (projeto, emendas, votações), informe só as
              páginas do texto publicado: versões do projeto não podem virar trecho de busca.
            </>
          }
        >
          <Input
            value={norma}
            onChange={(e) => setNorma(e.target.value)}
            placeholder="Páginas da norma: 2-30"
            aria-label="Páginas que são o texto da norma"
            className="h-8 w-44"
          />
          <Button
            size="sm"
            variant={p.trechos.total > 0 ? "outline" : "default"}
            disabled={etapa.pending || p.paginas.texto + p.paginas.ocr === 0}
            onClick={() => etapa.executar(() => dividirEmTrechos(p.documentoId, norma))}
          >
            {p.trechos.total > 0 ? "Dividir de novo" : "Dividir"}
          </Button>
        </Etapa>

        <Etapa
          feita={p.trechos.total > 0 && p.trechos.indexados === p.trechos.total}
          titulo="4. Índice para busca por sentido"
          detalhe={
            p.voyage
              ? `${p.trechos.indexados} de ${p.trechos.total} trechos indexados.`
              : "Sem VOYAGE_API_KEY: a busca do copiloto usa só palavras."
          }
        >
          <Button
            size="sm"
            disabled={
              etapa.pending ||
              !p.voyage ||
              p.trechos.total === 0 ||
              p.trechos.indexados === p.trechos.total
            }
            onClick={() =>
              etapa.executar(() => indexarProximosTrechos(p.documentoId), { repetir: true })
            }
          >
            Indexar
          </Button>
        </Etapa>
      </ol>
    </div>
  )
}
