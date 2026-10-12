"use client"

import { Loader2, Trash2 } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { CheckboxField, SelectField, TextareaField } from "@/components/forms/fields"
import { FormStatus } from "@/components/forms/form-status"
import { TextField } from "@/components/forms/text-field"
import { useFormAction } from "@/components/forms/use-form-action"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { COVERAGE_STATUS, LEGAL_DOCUMENT_KIND, options, UFS } from "@/lib/domain/labels"
import type { FormState } from "@/lib/forms"
import type { Tables } from "@/lib/supabase/database.types"

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

export function MunicipalityForm({
  action,
  initial,
  submitLabel,
}: {
  action: Action
  initial?: Pick<Tables<"municipalities">, "name" | "uf" | "ibge_code" | "coverage_status">
  submitLabel: string
}) {
  const { state, pending, onSubmit, errorsFor } = useFormAction(action)
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormStatus error={state.error} />
      <FieldGroup className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <TextField
            name="name"
            label="Nome"
            defaultValue={initial?.name}
            errors={errorsFor("name")}
          />
        </div>
        <SelectField
          name="uf"
          label="UF"
          options={UFS.map((uf) => [uf, uf] as const)}
          defaultValue={initial?.uf ?? null}
          errors={errorsFor("uf")}
        />
        <TextField
          name="ibge_code"
          label="Código IBGE"
          inputMode="numeric"
          maxLength={7}
          defaultValue={initial?.ibge_code}
          description="7 dígitos."
          errors={errorsFor("ibge_code")}
        />
        <div className="sm:col-span-2">
          <SelectField
            name="coverage_status"
            label="Cobertura normativa"
            options={options(COVERAGE_STATUS)}
            defaultValue={initial?.coverage_status ?? "sem_cobertura"}
            description="Indica se a base de regras do município já pode ser usada nas análises."
            errors={errorsFor("coverage_status")}
          />
        </div>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function LegalDocumentForm({ action }: { action: Action }) {
  const { state, pending, onSubmit, errorsFor } = useFormAction(action)
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" key={state.savedAt ?? 0}>
      <FormStatus error={state.error} />
      <FieldGroup className="grid gap-4 sm:grid-cols-4">
        <SelectField
          name="kind"
          label="Tipo"
          options={options(LEGAL_DOCUMENT_KIND)}
          errors={errorsFor("kind")}
        />
        <TextField
          name="number"
          label="Número"
          placeholder="Ex.: 236/2017"
          errors={errorsFor("number")}
        />
        <div className="sm:col-span-2">
          <TextField name="title" label="Ementa / título" errors={errorsFor("title")} />
        </div>
        <TextField
          name="published_on"
          label="Publicação"
          type="date"
          errors={errorsFor("published_on")}
        />
        <TextField
          name="effective_from"
          label="Início da vigência"
          type="date"
          errors={errorsFor("effective_from")}
        />
        <TextField
          name="effective_until"
          label="Fim da vigência"
          type="date"
          errors={errorsFor("effective_until")}
        />
        <TextField
          name="official_url"
          label="Link oficial"
          type="url"
          placeholder="https://"
          errors={errorsFor("official_url")}
        />
      </FieldGroup>
      <TextareaField name="notes" label="Observações" rows={2} errors={errorsFor("notes")} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CheckboxField
          name="is_fictitious"
          label="Documento fictício (dados de teste)"
          description="Nunca deve ir para relatório real."
        />
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Cadastrar documento
        </Button>
      </div>
    </form>
  )
}

export function DeleteButton({
  action,
  confirmMessage,
  label = "Remover",
}: {
  action: () => Promise<FormState>
  confirmMessage: string
  label?: string
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmMessage)) return
        startTransition(async () => {
          const result = await action()
          if (result.error) toast.error(result.error)
          else if (result.message) toast.success(result.message)
        })
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
    </Button>
  )
}
