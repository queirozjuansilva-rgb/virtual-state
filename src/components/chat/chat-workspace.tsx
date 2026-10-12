"use client"

import { PanelRight } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

import { Compositor } from "./compositor"
import { Mensagens } from "./mensagens"
import { PainelLote } from "./painel-lote"
import { useCopiloto, type ItemTela } from "./use-copiloto"

/**
 * Área de trabalho do copiloto: conversa ao centro e "Contexto do lote" à
 * direita (em telas menores, numa gaveta).
 */
export function ChatWorkspace({
  conversaId,
  itensIniciais,
  terrenoInicial,
  versaoMotor,
  boasVindas,
}: {
  conversaId: string | null
  itensIniciais: ItemTela[]
  terrenoInicial: string | null
  versaoMotor: string
  boasVindas?: ReactNode
}) {
  const chat = useCopiloto({ conversaId, itens: itensIniciais, terrenoId: terrenoInicial })
  const [gaveta, setGaveta] = useState(false)
  const vazio = chat.itens.length === 0

  function focar(id: string) {
    chat.setTerrenoId(id)
    if (window.matchMedia("(max-width: 1279px)").matches) setGaveta(true)
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-end px-4 pt-3 xl:hidden">
          <Button variant="outline" size="sm" onClick={() => setGaveta(true)}>
            <PanelRight aria-hidden />
            Contexto do lote
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {vazio && boasVindas ? (
            boasVindas
          ) : (
            <Mensagens itens={chat.itens} enviando={chat.enviando} onFoco={focar} />
          )}
        </div>
        <Compositor
          conversaId={chat.conversaId}
          enviando={chat.enviando}
          versaoMotor={versaoMotor}
          onEnviar={(envio) => void chat.enviar(envio)}
          onParar={chat.parar}
          onConversaCriada={chat.definirConversa}
          mostrarAcoes={vazio}
        />
      </div>

      <aside
        aria-label="Contexto do lote"
        className="hidden w-80 shrink-0 overflow-y-auto border-l bg-muted/20 xl:block 2xl:w-96"
      >
        <PainelLote terrenoId={chat.terrenoId} />
      </aside>
      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Contexto do lote</SheetTitle>
          </SheetHeader>
          {gaveta && <PainelLote terrenoId={chat.terrenoId} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}
