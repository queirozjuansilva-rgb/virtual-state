"use client"

import { Bot, CircleAlert, CircleCheck, LoaderCircle, Paperclip, TriangleAlert } from "lucide-react"
import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

import { CartaoChat } from "./cartoes"
import { Markdown } from "./markdown"
import type { ItemTela } from "./use-copiloto"

export function Mensagens({
  itens,
  enviando,
  onFoco,
}: {
  itens: ItemTela[]
  enviando: boolean
  onFoco: (terrenoId: string) => void
}) {
  const fim = useRef<HTMLDivElement>(null)
  const ultimo = itens.at(-1)
  const tamanhoUltimo = ultimo?.tipo === "assistente" ? ultimo.texto.length : 0

  // Acompanha a resposta enquanto ela chega.
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end", behavior: enviando ? "auto" : "smooth" })
  }, [itens.length, tamanhoUltimo, enviando])

  const aguardando = enviando && ultimo?.tipo === "usuario"

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6"
      aria-live="polite"
    >
      {itens.map((item) => {
        switch (item.tipo) {
          case "usuario":
            return (
              <div key={item.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                  <p className="whitespace-pre-wrap">{item.texto}</p>
                  {item.anexos.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {item.anexos.map((a) => (
                        <li
                          key={a}
                          className="flex items-center gap-1 rounded-md bg-primary-foreground/15 px-2 py-0.5 text-xs"
                        >
                          <Paperclip className="size-3" aria-hidden />
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          case "assistente":
            return (
              <div key={item.id} className="flex gap-3">
                <Avatar />
                <div className="min-w-0 flex-1 pt-1">
                  <Markdown texto={item.texto} />
                </div>
              </div>
            )
          case "progresso":
            return (
              <p
                key={item.id}
                className="ml-11 border-l-2 pl-3 text-xs text-muted-foreground italic"
              >
                {item.texto}
              </p>
            )
          case "ferramenta":
            return (
              <p
                key={item.id}
                className={cn(
                  "ml-11 flex items-center gap-1.5 text-xs",
                  item.estado === "erro"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
                )}
              >
                {item.estado === "inicio" ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : item.estado === "fim" ? (
                  <CircleCheck className="size-3.5 text-brand" aria-hidden />
                ) : (
                  <TriangleAlert className="size-3.5" aria-hidden />
                )}
                {item.rotulo}
                {item.estado === "erro" && " (não concluído)"}
              </p>
            )
          case "cartao":
            return (
              <div key={item.id} className="ml-11">
                <CartaoChat cartao={item.cartao} onFoco={onFoco} />
              </div>
            )
          case "erro":
            return (
              <p
                key={item.id}
                role="alert"
                className="ml-11 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <CircleAlert className="size-4" aria-hidden />
                {item.texto}
              </p>
            )
        }
      })}
      {aguardando && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Avatar />
          <span className="flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Analisando…
          </span>
        </div>
      )}
      <div ref={fim} />
    </div>
  )
}

function Avatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-brand">
      <Bot className="size-4.5" aria-hidden />
    </span>
  )
}
