"use client"

import { Loader2, Lock, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { CheckboxField, TextareaField } from "@/components/forms/fields"
import { FormStatus } from "@/components/forms/form-status"
import { TextField } from "@/components/forms/text-field"
import { useFormAction } from "@/components/forms/use-form-action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import { formatDate, formatDateTime } from "@/lib/format"
import type { FormState } from "@/lib/forms"
import { AVISO_BLOQUEIO_JURIDICO } from "@/lib/legislacao/bloqueio-juridico"
import type { Enums } from "@/lib/supabase/database.types"
import { cn } from "@/lib/utils"

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

/** Aviso no topo da regra: a validação está travada; o rascunho segue livre. */
export function AvisoBloqueioJuridico({
  titulos,
  municipioId,
}: {
  titulos: string[]
  municipioId?: string
}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <span>
        <span className="font-medium">{AVISO_BLOQUEIO_JURIDICO}.</span> {titulos.join("; ")}. O
        rascunho pode ser salvo normalmente; a validação volta a ser possível depois do registro do
        parecer jurídico
        {municipioId ? (
          <>
            {" "}
            em{" "}
            <Link
              href={`/admin/municipios/${municipioId}#pendencias`}
              className="text-primary underline-offset-4 hover:underline"
            >
              Pendências jurídicas do município
            </Link>
          </>
        ) : null}
        .
      </span>
    </div>
  )
}

/**
 * Rola até a âncora quando a seção chega depois do primeiro desenho da página
 * (conteúdo em streaming): sem isso, o link "#pendencias" cai no topo.
 */
export function RolarParaAncora({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return
    document.getElementById(id)?.scrollIntoView({ block: "start" })
  }, [id])
  return null
}

export type PendenciaJuridicaView = {
  id: string
  title: string
  description: string
  status: Enums<"legal_pendency_status">
  opened_at: string
  opinion_summary: string | null
  opinion_author: string | null
  opinion_date: string | null
  opinion_reference: string | null
  resolved_at: string | null
  normas: { id: string; kind: Enums<"legal_document_kind">; number: string }[]
  alcance: { normas_diretas: number; normas_relacionadas: number; regras: number } | null
}

/** Uma pendência: o que está em análise, o que ela alcança e o parecer que a encerra. */
export function PendenciaJuridica({
  pendencia,
  action,
}: {
  pendencia: PendenciaJuridicaView
  action: Action
}) {
  const aberta = pendencia.status === "aberta"
  const relacionadas = pendencia.alcance?.normas_relacionadas ?? 0
  return (
    <article className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{pendencia.title}</h3>
          <p className="text-sm text-muted-foreground">
            Aberta em {formatDate(pendencia.opened_at)}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            aberta
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              : "text-muted-foreground",
          )}
        >
          {aberta ? <Lock aria-hidden /> : <ShieldCheck aria-hidden />}
          {aberta ? "Aberta: homologação bloqueada" : "Encerrada com parecer"}
        </Badge>
      </header>

      <p className="text-sm">{pendencia.description}</p>

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Normas em análise</dt>
        <dd>
          {pendencia.normas.map((n) => `${LEGAL_DOCUMENT_KIND[n.kind]} nº ${n.number}`).join(", ")}
          {relacionadas > 0 &&
            ` e ${relacionadas} norma(s) que as alteram, regulamentam, revogam ou consolidam`}
        </dd>
        <dt className="text-muted-foreground">Regras alcançadas</dt>
        <dd>
          {pendencia.alcance?.regras ?? "—"}{" "}
          {aberta
            ? "(só a validação fica bloqueada; rascunhos continuam livres)"
            : "(homologação liberada)"}
        </dd>
      </dl>

      {aberta ? (
        <FormularioDesbloqueio action={action} />
      ) : (
        <dl className="grid gap-x-4 gap-y-1 border-t pt-3 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Parecer</dt>
          <dd className="whitespace-pre-line">{pendencia.opinion_summary}</dd>
          <dt className="text-muted-foreground">Responsável</dt>
          <dd>{pendencia.opinion_author}</dd>
          <dt className="text-muted-foreground">Data do parecer</dt>
          <dd>{formatDate(pendencia.opinion_date)}</dd>
          {pendencia.opinion_reference && (
            <>
              <dt className="text-muted-foreground">Referência</dt>
              <dd>{pendencia.opinion_reference}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Registrado em</dt>
          <dd>{formatDateTime(pendencia.resolved_at)}</dd>
        </dl>
      )}
    </article>
  )
}

function FormularioDesbloqueio({ action }: { action: Action }) {
  const { state, pending, onSubmit, errorsFor } = useFormAction(action)
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 border-t pt-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">Registrar parecer e desbloquear</h4>
        <p className="text-sm text-muted-foreground">
          Use só com o parecer de um especialista em mãos. O registro fica na auditoria e não valida
          nenhuma regra: cada uma continua precisando de homologação técnica.
        </p>
      </div>
      <FormStatus error={state.error} />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextareaField
            name="parecer"
            label="Conclusão do parecer"
            rows={4}
            maxLength={8000}
            description="Resposta a cada pergunta da consulta, como consta do parecer."
            errors={errorsFor("parecer")}
          />
        </div>
        <TextField
          name="responsavel"
          label="Responsável"
          placeholder="Nome e OAB ou cargo"
          maxLength={300}
          errors={errorsFor("responsavel")}
        />
        <TextField name="data" label="Data do parecer" type="date" errors={errorsFor("data")} />
        <div className="sm:col-span-2">
          <TextField
            name="referencia"
            label="Referência (opcional)"
            placeholder="Número do parecer, processo ou link"
            maxLength={500}
            errors={errorsFor("referencia")}
          />
        </div>
      </FieldGroup>
      <CheckboxField
        name="confirmacao"
        label="Confirmo que o parecer foi emitido pelo responsável indicado."
        errors={errorsFor("confirmacao")}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShieldCheck aria-hidden />}
          Registrar parecer e desbloquear
        </Button>
      </div>
    </form>
  )
}
