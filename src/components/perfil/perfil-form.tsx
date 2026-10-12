"use client"

import { CheckboxField, SelectField, TextareaField } from "@/components/forms/fields"
import { FormStatus } from "@/components/forms/form-status"
import { TextField } from "@/components/forms/text-field"
import { useFormAction } from "@/components/forms/use-form-action"
import { Button } from "@/components/ui/button"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { LAND_USE } from "@/lib/domain/labels"
import { toInputNumber } from "@/lib/format"
import type { Tables } from "@/lib/supabase/database.types"
import { salvarPerfil } from "@/server/copiloto/perfil"

const TOLERANCIA = [
  ["baixa", "Baixa"],
  ["media", "Média"],
  ["alta", "Alta"],
] as const

export function PerfilForm({ perfil }: { perfil: Tables<"investor_profiles"> | null }) {
  const { state, pending, onSubmit, errorsFor } = useFormAction(salvarPerfil)

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="ticket_min"
          label="Ticket mínimo"
          unit="R$"
          inputMode="decimal"
          defaultValue={toInputNumber(perfil?.ticket_min)}
          errors={errorsFor("ticket_min")}
        />
        <TextField
          name="ticket_max"
          label="Ticket máximo"
          unit="R$"
          inputMode="decimal"
          description="Quanto pretende investir no terreno."
          defaultValue={toInputNumber(perfil?.ticket_max)}
          errors={errorsFor("ticket_max")}
        />
        <TextField
          name="min_margin"
          label="Margem mínima sobre o VGV"
          unit="%"
          inputMode="decimal"
          defaultValue={toInputNumber(perfil?.min_margin, 100)}
          errors={errorsFor("min_margin")}
        />
        <TextField
          name="horizon_months"
          label="Horizonte do investimento"
          unit="meses"
          inputMode="numeric"
          defaultValue={toInputNumber(perfil?.horizon_months)}
          errors={errorsFor("horizon_months")}
        />
        <SelectField
          name="risk_tolerance"
          label="Tolerância a risco"
          options={TOLERANCIA}
          allowEmpty
          emptyLabel="Não informada"
          defaultValue={perfil?.risk_tolerance}
          errors={errorsFor("risk_tolerance")}
        />
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">Tipologias de interesse</FieldLegend>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(LAND_USE).map(([uso, rotulo]) => (
            <CheckboxField
              key={uso}
              name={`tipologia_${uso}`}
              label={rotulo}
              defaultChecked={perfil?.typologies.includes(uso)}
            />
          ))}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Modelo de aquisição</FieldLegend>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField
            name="aquisicao_compra"
            label="Compra"
            defaultChecked={perfil?.acquisition_models.includes("compra")}
          />
          <CheckboxField
            name="aquisicao_permuta"
            label="Permuta"
            defaultChecked={perfil?.acquisition_models.includes("permuta")}
          />
        </div>
      </FieldSet>

      <TextareaField
        name="regions"
        label="Regiões de interesse"
        description="Bairros, cidades ou regiões, separados por vírgula."
        rows={2}
        defaultValue={perfil?.regions.join(", ")}
        errors={errorsFor("regions")}
      />

      <FormStatus error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar perfil"}
      </Button>
    </form>
  )
}
