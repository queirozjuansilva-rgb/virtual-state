"use client"

import { Archive, CircleCheck, Loader2, Save } from "lucide-react"
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

type Source = { legal_document_id: string; article: string; excerpt: string | null }

export type RuleInitial = {
  use_type?: Enums<"land_use">
  use_label_local?: string | null
  observacoes?: string | null
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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  archiveAction?: () => Promise<FormState>
  initial: RuleInitial
  documents: { id: string; kind: Enums<"legal_document_kind">; number: string }[]
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
}: {
  field: RuleField
  initialValue: unknown
  source?: Source
  docOptions: (readonly [string, string])[]
  errorsFor: (name: string) => string[] | undefined
}) {
  const sourceErrors = errorsFor(`src_${field.key}`)
  return (
    <div className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div>
        <ValueInput field={field} initialValue={initialValue} errors={errorsFor(field.key)} />
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
        </div>
        {sourceErrors && (
          <div className="sm:col-span-2">
            <FieldError errors={sourceErrors.map((message) => ({ message }))} />
          </div>
        )}
      </fieldset>
    </div>
  )
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
