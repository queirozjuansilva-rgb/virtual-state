"use client"

import {
  Archive,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { RuleStatusBadge } from "@/components/admin/badges"
import { Section } from "@/components/admin/page-header"
import { CheckboxField, SelectField, TextareaField } from "@/components/forms/fields"
import { FormStatus } from "@/components/forms/form-status"
import { TextField } from "@/components/forms/text-field"
import { useFormAction } from "@/components/forms/use-form-action"
import { Button } from "@/components/ui/button"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LAND_USE, LEGAL_DOCUMENT_KIND, options } from "@/lib/domain/labels"
import { RULE_FIELDS, type RuleField } from "@/lib/domain/zoning-rule-fields"
import { formatDate, formatNumber, toInputNumber } from "@/lib/format"
import {
  evaluateFormula,
  formatFormula,
  formulaVariables,
  tryParseFormula,
  VARIABLES,
} from "@/lib/formula"
import type { FormState } from "@/lib/forms"
import type { Enums } from "@/lib/supabase/database.types"

type Source = {
  legal_document_id: string
  article: string
  excerpt: string | null
  page?: number | null
  condition?: string | null
  resolution_note?: string | null
  excerpt_verified?: boolean | null
}

/** Contexto da revisão lado a lado (Fase 5). */
export type RuleReview = {
  /** Valores sugeridos pela extração assistida. */
  extracted: Record<string, unknown> | null
  /** Regra validada atual da mesma zona × uso, quando esta é um rascunho. */
  validada: {
    values: Record<string, unknown>
    sources: Record<string, { legal_document_id: string; article: string }>
  } | null
  pdfUrls: Record<string, string>
  docLabels: Record<string, string>
}

export type RuleInitial = {
  use_type?: Enums<"land_use">
  use_label_local?: string | null
  observacoes?: string | null
  validation_note?: string | null
  status?: Enums<"rule_status">
  validated_at?: string | null
  values: Record<string, unknown>
  sources: Record<string, Source>
}

const EXAMPLE_VARS = { H: 30, P: 10, A: 1000, T: 20 }

export function RuleForm({
  action,
  archiveAction,
  initial,
  documents,
  review,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  archiveAction?: () => Promise<FormState>
  initial: RuleInitial
  documents: { id: string; kind: Enums<"legal_document_kind">; number: string }[]
  review?: RuleReview
}) {
  const { state, pending, onSubmit, errorsFor } = useFormAction(action)
  const docOptions = documents.map(
    (d) => [d.id, `${LEGAL_DOCUMENT_KIND[d.kind]} nº ${d.number}`] as const,
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={state.error} />
      {documents.length === 0 && (
        <FormStatus error="Cadastre ao menos um documento legal no município para poder citar as fontes." />
      )}

      <Section title="Uso">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="use_type"
            label="Uso (categoria do motor)"
            options={options(LAND_USE)}
            defaultValue={initial.use_type ?? null}
            errors={errorsFor("use_type")}
          />
          <TextField
            name="use_label_local"
            label="Nome do uso na lei local"
            placeholder="Ex.: Residencial multifamiliar"
            defaultValue={initial.use_label_local ?? ""}
            errors={errorsFor("use_label_local")}
          />
        </FieldGroup>
        <ParameterRow
          field={RULE_FIELDS[0]}
          initialValue={initial.values.permitted}
          source={initial.sources.permitted}
          docOptions={docOptions}
          errorsFor={errorsFor}
          review={review}
        />
      </Section>

      <Section
        title="Parâmetros urbanísticos"
        description="Deixe vazio o que a lei não define. Para validar, todo parâmetro preenchido precisa de lei e artigo."
      >
        <div className="divide-y">
          {RULE_FIELDS.slice(1).map((field) => (
            <ParameterRow
              key={field.key}
              field={field}
              initialValue={initial.values[field.key]}
              source={initial.sources[field.key]}
              docOptions={docOptions}
              errorsFor={errorsFor}
              review={review}
            />
          ))}
        </div>
      </Section>

      <Section title="Observações">
        <TextareaField
          name="observacoes"
          label="Observações"
          rows={3}
          defaultValue={initial.observacoes ?? ""}
          errors={errorsFor("observacoes")}
        />
      </Section>

      <Section
        title="Homologação"
        description="Obrigatória para validar: quem conferiu, contra qual texto e o que ficou pendente. A IA nunca valida regra."
      >
        <TextareaField
          name="validation_note"
          label="Nota de homologação"
          rows={2}
          maxLength={2000}
          placeholder="Ex.: Conferido por Fulano (CREA 000) com a LC 62/2009, Art. 81, e alterações até a LC 439/2025."
          defaultValue={initial.validation_note ?? ""}
          errors={errorsFor("validation_note")}
        />
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {initial.status ? (
            <>
              <RuleStatusBadge status={initial.status} />
              {initial.validated_at && `em ${formatDate(initial.validated_at)}`}
            </>
          ) : (
            "Nova regra"
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {archiveAction && initial.status === "validado" && (
            <ArchiveButton action={archiveAction} />
          )}
          <Button type="submit" name="intent" value="rascunho" variant="outline" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Salvar rascunho
          </Button>
          <Button type="submit" name="intent" value="validar" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <CircleCheck aria-hidden />
            )}
            Salvar e validar
          </Button>
        </div>
      </div>
    </form>
  )
}

function ParameterRow({
  field,
  initialValue,
  source,
  docOptions,
  errorsFor,
  review,
}: {
  field: RuleField
  initialValue: unknown
  source?: Source
  docOptions: (readonly [string, string])[]
  errorsFor: (name: string) => string[] | undefined
  review?: RuleReview
}) {
  const sourceErrors = errorsFor(`src_${field.key}`)
  const sugerido = review?.extracted?.[field.key]
  const validado = review?.validada?.values[field.key]
  const fonteValidada = review?.validada?.sources[field.key]
  const mudouDaValidada = review?.validada != null && !mesmoValor(validado, initialValue)
  const conflito =
    mudouDaValidada &&
    fonteValidada &&
    source &&
    fonteValidada.legal_document_id !== source.legal_document_id
  const pdf = source && review?.pdfUrls[source.legal_document_id]
  return (
    <div className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="space-y-2">
        <ValueInput field={field} initialValue={initialValue} errors={errorsFor(field.key)} />
        {sugerido !== undefined && !mesmoValor(sugerido, initialValue) && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" aria-hidden /> IA sugeriu:{" "}
            {formatarValor(field, sugerido)}
          </p>
        )}
        {mudouDaValidada && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs">
            Regra validada atual: <strong>{formatarValor(field, validado)}</strong>
            {fonteValidada &&
              ` (${review?.docLabels[fonteValidada.legal_document_id] ?? "outra norma"}, ${fonteValidada.article})`}
          </p>
        )}
      </div>
      <fieldset className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Fonte: {field.label}
        </legend>
        <SelectField
          name={`src_${field.key}_doc`}
          label="Lei / documento"
          options={docOptions}
          defaultValue={source?.legal_document_id ?? null}
          allowEmpty
          emptyLabel="Sem fonte"
        />
        <TextField
          name={`src_${field.key}_article`}
          label="Artigo"
          placeholder="Ex.: Art. 42, Anexo II"
          defaultValue={source?.article ?? ""}
        />
        <div className="sm:col-span-2">
          <TextareaField
            name={`src_${field.key}_excerpt`}
            label="Trecho citado"
            rows={2}
            defaultValue={source?.excerpt ?? ""}
          />
          {source?.excerpt_verified === true && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-primary">
              <CircleCheck className="size-3.5" aria-hidden /> Trecho encontrado no texto da página.
            </p>
          )}
          {source?.excerpt_verified === false && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <CircleAlert className="size-3.5" aria-hidden /> Trecho não localizado no texto da
              página: confira no PDF.
            </p>
          )}
        </div>
        <TextField
          name={`src_${field.key}_page`}
          label="Página do PDF"
          inputMode="numeric"
          defaultValue={source?.page ? String(source.page) : ""}
          description={
            pdf && source?.page ? (
              <a
                href={`${pdf}#page=${source.page}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary"
              >
                Abrir a página {source.page} <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : undefined
          }
        />
        <TextField
          name={`src_${field.key}_condition`}
          label="Condição ou exceção"
          placeholder="Ex.: lotes acima de 1.000 m²"
          maxLength={500}
          defaultValue={source?.condition ?? ""}
        />
        {(conflito || source?.resolution_note) && (
          <div className="sm:col-span-2">
            <TextareaField
              name={`src_${field.key}_resolution`}
              label="Resolução do conflito de fontes"
              rows={2}
              maxLength={1000}
              placeholder="Qual norma prevalece e por quê (ex.: LC 236/2017 é posterior e específica)."
              defaultValue={source?.resolution_note ?? ""}
            />
          </div>
        )}
        {sourceErrors && (
          <div className="sm:col-span-2">
            <FieldError errors={sourceErrors.map((message) => ({ message }))} />
          </div>
        )}
      </fieldset>
    </div>
  )
}

function mesmoValor(a: unknown, b: unknown): boolean {
  const vazio = (v: unknown) => v === null || v === undefined || v === ""
  if (vazio(a) && vazio(b)) return true
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))
  return String(a) === String(b)
}

function formatarValor(field: RuleField, v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio"
  if (field.kind === "boolean") return v ? "Sim" : "Não"
  if (field.kind === "percent" && typeof v === "number") return `${formatNumber(v * 100)}%`
  if (typeof v === "number") return `${formatNumber(v)}${field.unit ? ` ${field.unit}` : ""}`
  return String(v)
}

function ValueInput({
  field,
  initialValue,
  errors,
}: {
  field: RuleField
  initialValue: unknown
  errors?: string[]
}) {
  switch (field.kind) {
    case "boolean":
      return (
        <CheckboxField
          name={field.key}
          label={field.label}
          defaultChecked={initialValue === undefined ? true : Boolean(initialValue)}
          description="Desmarque se a lei proíbe este uso na zona."
          errors={errors}
        />
      )
    case "formula":
      return (
        <FormulaInput field={field} initialValue={initialValue as string | null} errors={errors} />
      )
    default:
      return (
        <TextField
          name={field.key}
          label={field.label}
          unit={field.unit}
          inputMode="decimal"
          defaultValue={toInputNumber(
            initialValue as number | null,
            field.kind === "percent" ? 100 : 1,
          )}
          description={field.hint}
          errors={errors}
        />
      )
  }
}

function FormulaInput({
  field,
  initialValue,
  errors,
}: {
  field: RuleField
  initialValue: string | null
  errors?: string[]
}) {
  const [text, setText] = useState(initialValue ?? "")
  const id = `field-${field.key}`
  const preview = describeFormula(text)
  const invalid = Boolean(errors?.length)

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.unit && <span className="text-muted-foreground"> ({field.unit})</span>}
      </label>
      <Input
        id={id}
        name={field.key}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="font-mono"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-preview`}
      />
      <p id={`${id}-preview`} className="text-xs text-muted-foreground" aria-live="polite">
        {preview ?? field.hint}
      </p>
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </div>
  )
}

function describeFormula(text: string): string | null {
  if (text.trim() === "") return null
  const parsed = tryParseFormula(text)
  if (!parsed.ok) return `⚠ ${parsed.error.message}`
  const vars = [...formulaVariables(parsed.expr)]
  const canonical = formatFormula(parsed.expr)
  if (vars.length === 0) return `= ${formatNumber(evaluateFormula(parsed.expr))}`
  try {
    const example = vars.map((v) => `${v} = ${formatNumber(EXAMPLE_VARS[v])}`).join(", ")
    const value = evaluateFormula(parsed.expr, EXAMPLE_VARS)
    const legend = vars.map((v) => `${v}: ${VARIABLES[v]}`).join("; ")
    return `${canonical} · exemplo com ${example}: ${formatNumber(value)} · ${legend}`
  } catch (error) {
    return `⚠ ${(error as Error).message}`
  }
}

function ArchiveButton({ action }: { action: () => Promise<FormState> }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Arquivar esta regra? Ela deixa de alimentar o motor de viabilidade."))
          return
        startTransition(async () => {
          const result = await action()
          if (result.error) toast.error(result.error)
          else if (result.message) toast.success(result.message)
        })
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Archive aria-hidden />}
      Arquivar
    </Button>
  )
}
