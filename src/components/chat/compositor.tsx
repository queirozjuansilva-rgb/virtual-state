"use client"

import { LoaderCircle, MapPin, Paperclip, SendHorizontal, Square, X } from "lucide-react"
import { useRef, useState, type KeyboardEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { enviarAnexo, removerAnexo } from "@/server/copiloto/actions"

import { SeletorPonto } from "./seletor-ponto"
import type { EnvioChat, Ponto } from "./use-copiloto"

const TIPOS_ACEITOS = "application/pdf,image/jpeg,image/png,image/webp"
const MAX_ANEXOS = 5

export const ACOES_RAPIDAS = [
  { rotulo: "Buscar terrenos", texto: "Quais terrenos disponíveis permitem prédio residencial?" },
  { rotulo: "Verificar recuos", texto: "Quais são os recuos do terreno " },
  { rotulo: "Melhor uso", texto: "Qual o melhor uso para o terreno " },
  { rotulo: "Comparar terrenos", texto: "Compare os terrenos " },
] as const

export function Compositor({
  conversaId,
  enviando,
  versaoMotor,
  onEnviar,
  onParar,
  onConversaCriada,
  mostrarAcoes,
}: {
  conversaId: string | null
  enviando: boolean
  versaoMotor: string
  onEnviar: (envio: EnvioChat) => void
  onParar: () => void
  onConversaCriada: (id: string) => void
  mostrarAcoes: boolean
}) {
  const [texto, setTexto] = useState("")
  const [anexos, setAnexos] = useState<{ id: string; nome: string }[]>([])
  const [subindo, setSubindo] = useState(false)
  const [ponto, setPonto] = useState<Ponto | null>(null)
  const [mapaAberto, setMapaAberto] = useState(false)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const podeEnviar = texto.trim().length > 0 && !enviando && !subindo

  function enviar() {
    if (!podeEnviar) return
    onEnviar({ texto: texto.trim(), ponto, anexos })
    setTexto("")
    setAnexos([])
    setPonto(null)
  }

  function teclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      enviar()
    }
  }

  async function anexar(lista: FileList | null) {
    if (!lista?.length) return
    setSubindo(true)
    let conversa = conversaId
    try {
      for (const f of Array.from(lista).slice(0, MAX_ANEXOS - anexos.length)) {
        const dados = new FormData()
        dados.set("arquivo", f)
        if (conversa) dados.set("conversaId", conversa)
        const r = await enviarAnexo(dados)
        if (!r.ok) {
          toast.error(`${f.name}: ${r.erro}`)
          continue
        }
        if (r.conversaId !== conversa) {
          conversa = r.conversaId
          onConversaCriada(r.conversaId)
        }
        setAnexos((atual) => [...atual, r.anexo])
      }
    } finally {
      setSubindo(false)
      if (arquivo.current) arquivo.current.value = ""
    }
  }

  return (
    <div className="px-4 pt-2 pb-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border bg-card p-2 shadow-lg shadow-black/5">
          {(anexos.length > 0 || ponto) && (
            <ul className="flex flex-wrap gap-1.5 px-2 pt-1">
              {anexos.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                >
                  <Paperclip className="size-3" aria-hidden />
                  {a.nome}
                  <button
                    type="button"
                    aria-label={`Remover ${a.nome}`}
                    className="rounded text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setAnexos((atual) => atual.filter((x) => x.id !== a.id))
                      void removerAnexo(a.id)
                    }}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
              {ponto && (
                <li className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground tabular-nums">
                  <MapPin className="size-3" aria-hidden />
                  {ponto.latitude.toFixed(5)}, {ponto.longitude.toFixed(5)}
                  <button
                    type="button"
                    aria-label="Remover ponto"
                    className="rounded opacity-70 hover:opacity-100"
                    onClick={() => setPonto(null)}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </li>
              )}
            </ul>
          )}
          <div className="flex items-center gap-1 px-1 pt-1">
            <input
              ref={arquivo}
              type="file"
              accept={TIPOS_ACEITOS}
              multiple
              hidden
              onChange={(e) => void anexar(e.target.files)}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Anexar documento (PDF ou imagem)"
              disabled={subindo || enviando || anexos.length >= MAX_ANEXOS}
              onClick={() => arquivo.current?.click()}
            >
              {subindo ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Paperclip aria-hidden />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Selecionar localização no mapa"
              disabled={enviando}
              onClick={() => setMapaAberto(true)}
            >
              <MapPin aria-hidden />
            </Button>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <span className="px-1 text-[0.65rem] font-semibold tracking-widest text-muted-foreground uppercase">
              Motor de viabilidade v{versaoMotor}
            </span>
          </div>
          <div className="flex items-end gap-3 px-2 pb-1">
            <label htmlFor="mensagem-copiloto" className="sr-only">
              Mensagem para o copiloto
            </label>
            <textarea
              id="mensagem-copiloto"
              ref={campo}
              rows={1}
              value={texto}
              maxLength={8000}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={teclar}
              placeholder="Pergunte sobre um terreno, o zoneamento de um local ou a viabilidade de um projeto…"
              className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground"
            />
            {enviando ? (
              <Button
                size="icon-lg"
                variant="outline"
                aria-label="Parar a resposta"
                onClick={onParar}
              >
                <Square aria-hidden />
              </Button>
            ) : (
              <Button
                size="icon-lg"
                aria-label="Enviar mensagem"
                disabled={!podeEnviar}
                onClick={enviar}
              >
                <SendHorizontal aria-hidden />
              </Button>
            )}
          </div>
        </div>
        {mostrarAcoes && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
              Ações rápidas:
            </span>
            {ACOES_RAPIDAS.map((a) => (
              <Button
                key={a.rotulo}
                variant="secondary"
                size="xs"
                onClick={() => {
                  setTexto(a.texto)
                  campo.current?.focus()
                }}
              >
                {a.rotulo}
              </Button>
            ))}
          </div>
        )}
        <p className="mt-2 text-center text-[0.65rem] text-muted-foreground">
          Estudo preliminar automatizado. Não substitui análise técnica, jurídica e de due
          diligence.
        </p>
      </div>
      <SeletorPonto
        key={mapaAberto ? "aberto" : "fechado"}
        aberto={mapaAberto}
        onAbertoChange={setMapaAberto}
        inicial={ponto}
        onConfirmar={setPonto}
      />
    </div>
  )
}
