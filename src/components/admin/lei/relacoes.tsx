"use client"

import { Link2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"

import { SelectField, TextareaField } from "@/components/forms/fields"
import { TextField } from "@/components/forms/text-field"
import { Button } from "@/components/ui/button"
import { LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import { EMPTY_SELECT_VALUE } from "@/lib/forms"
import type { Enums } from "@/lib/supabase/database.types"
import { removerRelacao, salvarRelacao } from "@/server/legislacao/actions"

const TIPO: Record<Enums<"legal_link_kind">, [string, string]> = {
  altera: ["altera", "alterada por"],
  revoga: ["revoga", "revogada (em parte) por"],
  regulamenta: ["regulamenta", "regulamentada por"],
  consolida: ["consolida", "consolidada em"],
}

type Relacao = {
  id: string
  kind: Enums<"legal_link_kind">
  articles: string | null
  notes: string | null
  outra: { id: string; kind: Enums<"legal_document_kind">; number: string } | null
}

const rotulo = (d: { kind: Enums<"legal_document_kind">; number: string }) =>
  `${LEGAL_DOCUMENT_KIND[d.kind]} nº ${d.number}`

/**
 * Quem altera quem. Na homologação, a regra cuja fonte foi alterada mostra o
 * aviso "esta lei tem alterações posteriores; confira o artigo".
 */
export function Relacoes({
  documentoId,
  alteradaPor,
  altera,
  outras,
}: {
  documentoId: string
  alteradaPor: Relacao[]
  altera: Relacao[]
  outras: { id: string; kind: Enums<"legal_document_kind">; number: string }[]
}) {
  const [pending, startTransition] = useTransition()

  function salvar(form: FormData) {
    const outra = String(form.get("outra") ?? "")
    startTransition(async () => {
      const r = await salvarRelacao(documentoId, {
        outra: outra === EMPTY_SELECT_VALUE ? "" : outra,
        sentido: form.get("sentido") as "esta_altera" | "alterada_por",
        kind: form.get("kind") as Enums<"legal_link_kind">,
        articles: String(form.get("articles") || "") || null,
        notes: String(form.get("notes") || "") || null,
      })
      if (r.ok) toast.success(r.mensagem)
      else toast.error(r.erro)
    })
  }

  const linha = (r: Relacao, sentido: 0 | 1) => (
    <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
      <div>
        <span className="text-muted-foreground">{TIPO[r.kind][sentido]} </span>
        {r.outra ? (
          <Link
            href={`/admin/leis/${r.outra.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {rotulo(r.outra)}
          </Link>
        ) : (
          "?"
        )}
        {r.articles && <span className="text-muted-foreground"> · {r.articles}</span>}
        {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Remover relação"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await removerRelacao(r.id)
            if (res.ok) toast.success(res.mensagem)
            else toast.error(res.erro)
          })
        }
      >
        <Trash2 aria-hidden />
      </Button>
    </li>
  )

  return (
    <div className="space-y-4">
      {alteradaPor.length + altera.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma relação cadastrada.</p>
      ) : (
        <ul className="divide-y">
          {alteradaPor.map((r) => linha(r, 1))}
          {altera.map((r) => linha(r, 0))}
        </ul>
      )}
      {outras.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Cadastre as outras normas no município para relacioná-las a esta.
        </p>
      ) : (
        <form
          action={salvar}
          className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-3"
        >
          <SelectField
            name="sentido"
            label="Esta norma"
            options={[
              ["alterada_por", "é afetada por"],
              ["esta_altera", "afeta"],
            ]}
            defaultValue="alterada_por"
          />
          <SelectField
            name="kind"
            label="Como"
            options={[
              ["altera", "alteração"],
              ["revoga", "revogação"],
              ["regulamenta", "regulamentação"],
              ["consolida", "consolidação"],
            ]}
            defaultValue="altera"
          />
          <SelectField
            name="outra"
            label="Outra norma"
            options={outras.map((o) => [o.id, rotulo(o)] as const)}
          />
          <TextField
            name="articles"
            label="Artigos afetados (se souber)"
            placeholder="Ex.: Art. 81, Art. 82"
            maxLength={500}
          />
          <div className="sm:col-span-2">
            <TextareaField name="notes" label="Observação" rows={1} maxLength={2000} />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" size="sm" disabled={pending}>
              <Link2 aria-hidden /> Relacionar
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
