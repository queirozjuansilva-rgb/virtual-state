"use client"

import { Loader2, Sparkles } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { RuleStatusBadge } from "@/components/admin/badges"
import { SelectField, TextareaField } from "@/components/forms/fields"
import { TextField } from "@/components/forms/text-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LAND_USE, options } from "@/lib/domain/labels"
import { formatUSD } from "@/lib/format"
import { interpretarPaginas, resumirPaginas } from "@/lib/legislacao/paginas"
import type { Enums } from "@/lib/supabase/database.types"
import { aplicarExtracao, criarZonasDaExtracao, extrairDaLei } from "@/server/legislacao/actions"

import { useEtapa } from "./use-etapa"

/** Formulário da extração assistida: páginas, uso-alvo e orientação, com estimativa de custo. */
export function FormExtracao({
  documentoId,
  totalPaginas,
  estimativa: custo,
}: {
  documentoId: string
  totalPaginas: number
  estimativa: { fixo: number; porPagina: number } | null
}) {
  const [pending, startTransition] = useTransition()
  const [paginas, setPaginas] = useState("")
  const lidas = interpretarPaginas(paginas, totalPaginas)
  const estimativa = lidas.ok && custo ? custo.fixo + custo.porPagina * lidas.paginas.length : null

  function extrair(form: FormData) {
    startTransition(async () => {
      const r = await extrairDaLei(documentoId, {
        paginas,
        usoAlvo: String(form.get("usoAlvo")) as Enums<"land_use">,
        instrucoes: String(form.get("instrucoes") || "") || null,
      })
      if (r.ok) toast.success(r.mensagem)
      else toast.error(r.erro)
    })
  }

  return (
    <form action={extrair} className="grid gap-4 sm:grid-cols-2">
      <TextField
        name="paginas"
        label="Páginas com os parâmetros"
        placeholder="Ex.: 79-95, 120"
        value={paginas}
        onChange={(e) => setPaginas(e.target.value)}
        description={
          paginas && !lidas.ok
            ? lidas.erro
            : lidas.ok
              ? `${lidas.paginas.length} página(s) · estimativa ${formatUSD(estimativa)}`
              : "Até 40 páginas por extração. Use a busca abaixo para achar as páginas."
        }
      />
      <SelectField
        name="usoAlvo"
        label="Uso-alvo"
        options={options(LAND_USE)}
        defaultValue="residencial_vertical"
        description="Os rascunhos são criados para este uso em cada zona."
      />
      <div className="sm:col-span-2">
        <TextareaField
          name="instrucoes"
          label="Orientação para a extração (opcional)"
          rows={2}
          maxLength={2000}
          placeholder="Ex.: os parâmetros por zona estão nos artigos de cada Seção; ignore as zonas especiais."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending || !lidas.ok}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {pending ? "Extraindo (pode levar 1–2 min)…" : "Extrair parâmetros"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Gera só rascunhos. Nada alimenta o motor antes da homologação por uma pessoa.
        </p>
      </div>
    </form>
  )
}

type Execucao = {
  id: string
  pages: number[]
  target_use: Enums<"land_use">
  status: Enums<"extraction_status">
  model: string
  prompt_version: string
  cost_usd: number | null
  error: string | null
  created_at: string
  zonasEncontradas: string[]
  regras: { id: string; status: Enums<"rule_status">; zona: string }[]
  acerto: { campos: number; iguais: number }
}

export function ListaExecucoes({ execucoes }: { execucoes: Execucao[] }) {
  const etapa = useEtapa()
  if (execucoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma extração ainda.</p>
  }
  return (
    <ul className="divide-y rounded-lg border">
      {execucoes.map((e) => {
        const faltam = e.zonasEncontradas.length - new Set(e.regras.map((r) => r.zona)).size
        return (
          <li key={e.id} className="space-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {new Date(e.created_at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              <span className="text-muted-foreground">
                págs. {resumirPaginas(e.pages)} · {LAND_USE[e.target_use]} · {e.model} ·{" "}
                {e.prompt_version}
              </span>
              {e.status === "concluida" ? (
                <Badge variant="outline">{formatUSD(e.cost_usd)}</Badge>
              ) : e.status === "erro" ? (
                <Badge variant="destructive">Erro</Badge>
              ) : (
                <Badge variant="secondary">Em andamento</Badge>
              )}
              {e.acerto.campos > 0 && (
                <Badge
                  variant="secondary"
                  title="Campos sugeridos pela IA que ficaram iguais na regra homologada"
                >
                  Acerto {Math.round((100 * e.acerto.iguais) / e.acerto.campos)}% ({e.acerto.iguais}
                  /{e.acerto.campos})
                </Badge>
              )}
            </div>
            {e.error && <p className="text-destructive">{e.error}</p>}
            {e.regras.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {e.regras.map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/regras/${r.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-muted"
                  >
                    {r.zona} <RuleStatusBadge status={r.status} />
                  </Link>
                ))}
              </div>
            )}
            {e.status === "concluida" && (
              <div className="flex flex-wrap items-center gap-2">
                {faltam > 0 && (
                  <>
                    <span className="text-muted-foreground">
                      Zonas sem cadastro: {e.zonasEncontradas.join(", ")}.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={etapa.pending}
                      onClick={() => etapa.executar(() => criarZonasDaExtracao(e.id))}
                    >
                      Cadastrar zonas (sem geometria) e criar rascunhos
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={etapa.pending}
                  onClick={() => etapa.executar(() => aplicarExtracao(e.id))}
                >
                  Recriar rascunhos
                </Button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
