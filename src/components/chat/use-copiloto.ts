"use client"

import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"

import type { EventoChat, ItemConversa } from "@/lib/ai/tipos"

export type ItemTela =
  | ItemConversa
  | {
      tipo: "ferramenta"
      id: string
      rotulo: string
      estado: "inicio" | "fim" | "erro"
    }
  | { tipo: "erro"; id: string; texto: string }

export type Ponto = { longitude: number; latitude: number }

export type EnvioChat = {
  texto: string
  ponto: Ponto | null
  anexos: { id: string; nome: string }[]
}

let sequencia = 0
const novoId = (prefixo: string) => `${prefixo}-${Date.now()}-${++sequencia}`

/** Aplica um evento do stream à lista de itens (puro; testável). */
export function aplicarEvento(
  itens: ItemTela[],
  evento: EventoChat,
  inicioPasso: number,
): { itens: ItemTela[]; inicioPasso: number } {
  switch (evento.t) {
    case "passo":
      return { itens, inicioPasso: itens.length }
    case "texto": {
      const ultimo = itens.at(-1)
      if (ultimo?.tipo === "assistente" && itens.length - 1 >= inicioPasso) {
        return {
          itens: [...itens.slice(0, -1), { ...ultimo, texto: ultimo.texto + evento.delta }],
          inicioPasso,
        }
      }
      return {
        itens: [...itens, { tipo: "assistente", id: novoId("a"), texto: evento.delta }],
        inicioPasso,
      }
    }
    case "descartar":
      return {
        itens: itens.filter((item, i) => i < inicioPasso || item.tipo !== "assistente"),
        inicioPasso,
      }
    case "recusa":
      return {
        itens: [
          ...itens.filter((item, i) => i < inicioPasso || item.tipo !== "assistente"),
          { tipo: "assistente", id: novoId("a"), texto: evento.mensagem },
        ],
        inicioPasso,
      }
    case "progresso":
      return {
        itens: [...itens, { tipo: "progresso", id: novoId("p"), texto: evento.texto }],
        inicioPasso,
      }
    case "ferramenta": {
      const existe = itens.findIndex((i) => i.tipo === "ferramenta" && i.id === evento.id)
      const item: ItemTela = {
        tipo: "ferramenta",
        id: evento.id,
        rotulo: evento.rotulo,
        estado: evento.estado,
      }
      if (existe === -1) return { itens: [...itens, item], inicioPasso }
      return { itens: itens.map((i, idx) => (idx === existe ? item : i)), inicioPasso }
    }
    case "cartao":
      return {
        itens: [...itens, { tipo: "cartao", id: novoId("c"), cartao: evento.cartao }],
        inicioPasso,
      }
    case "erro":
      return {
        itens: [...itens, { tipo: "erro", id: novoId("e"), texto: evento.mensagem }],
        inicioPasso,
      }
    default:
      return { itens, inicioPasso }
  }
}

/**
 * Estado da conversa e envio de mensagens ao copiloto (/api/chat, NDJSON).
 * A primeira mensagem cria a conversa: a URL vira /chat/[id] sem recarregar.
 */
export function useCopiloto(inicial: {
  conversaId: string | null
  itens: ItemTela[]
  terrenoId: string | null
}) {
  const router = useRouter()
  const [conversaId, setConversaId] = useState(inicial.conversaId)
  const [itens, setItens] = useState<ItemTela[]>(inicial.itens)
  const [terrenoId, setTerrenoId] = useState(inicial.terrenoId)
  const [enviando, setEnviando] = useState(false)
  const controle = useRef<AbortController | null>(null)
  const conversaRef = useRef(conversaId)

  const definirConversa = useCallback((id: string) => {
    conversaRef.current = id
    setConversaId(id)
  }, [])

  const enviar = useCallback(
    async ({ texto, ponto, anexos }: EnvioChat) => {
      if (controle.current) return
      const abort = new AbortController()
      controle.current = abort
      setEnviando(true)
      setItens((atual) => [
        ...atual,
        { tipo: "usuario", id: novoId("u"), texto, anexos: anexos.map((a) => a.nome) },
      ])

      let estado = { inicioPasso: Number.MAX_SAFE_INTEGER }
      const processar = (evento: EventoChat) => {
        if (evento.t === "conversa") {
          if (conversaRef.current !== evento.id) {
            definirConversa(evento.id)
            window.history.replaceState(null, "", `/chat/${evento.id}`)
          }
          return
        }
        if (evento.t === "foco") {
          setTerrenoId(evento.terrenoId)
          return
        }
        setItens((atual) => {
          const r = aplicarEvento(atual, evento, estado.inicioPasso)
          estado = { inicioPasso: r.inicioPasso }
          return r.itens
        })
      }

      try {
        const resposta = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversaId: conversaRef.current,
            texto,
            ponto,
            anexos: anexos.map((a) => a.id),
          }),
          signal: abort.signal,
        })
        if (!resposta.ok || !resposta.body) {
          const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null
          processar({ t: "erro", mensagem: corpo?.erro ?? "Não foi possível enviar a mensagem." })
          return
        }
        const leitor = resposta.body.pipeThrough(new TextDecoderStream()).getReader()
        let resto = ""
        for (;;) {
          const { value, done } = await leitor.read()
          if (done) break
          resto += value
          const linhas = resto.split("\n")
          resto = linhas.pop() ?? ""
          for (const linha of linhas) {
            if (linha.trim()) processar(JSON.parse(linha) as EventoChat)
          }
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error(error)
          processar({ t: "erro", mensagem: "A conexão com o copiloto caiu. Tente de novo." })
        }
      } finally {
        controle.current = null
        setEnviando(false)
        // Atualiza o histórico da barra lateral (título e ordem).
        router.refresh()
      }
    },
    [definirConversa, router],
  )

  const parar = useCallback(() => controle.current?.abort(), [])

  return { conversaId, definirConversa, itens, terrenoId, setTerrenoId, enviando, enviar, parar }
}
