"use client"

import { Loader2 } from "lucide-react"
import { useMemo } from "react"

import { GeometryEditor } from "@/components/admin/geometry-editor"
import { Section } from "@/components/admin/page-header"
import { SelectField, TextareaField } from "@/components/forms/fields"
import { FormStatus } from "@/components/forms/form-status"
import { TextField } from "@/components/forms/text-field"
import { useFormAction } from "@/components/forms/use-form-action"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { LEGAL_DOCUMENT_KIND, options, ZONE_KIND } from "@/lib/domain/labels"
import type { FormState } from "@/lib/forms"
import { bboxOfGeometries, toFeatureCollection } from "@/lib/geo/feature-collection"
import type { MultiPolygonGeometry } from "@/lib/geo/geojson"
import type { Enums } from "@/lib/supabase/database.types"

type ZoneInitial = {
  code?: string
  name?: string
  kind?: Enums<"zone_kind">
  description?: string | null
  legal_document_id?: string | null
  geojson?: unknown
}

export function ZoneForm({
  action,
  municipalityId,
  initial,
  documents,
  otherZones,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  municipalityId: string
  initial: ZoneInitial
  documents: { id: string; kind: Enums<"legal_document_kind">; number: string }[]
  otherZones: { id: string; code: string; geojson: unknown }[]
  submitLabel: string
}) {
  const { state, pending, onSubmit, errorsFor } = useFormAction(action)
  const overlays = useMemo(
    () => [
      {
        id: "other-zones",
        label: "Outras zonas do município",
        color: "#4f9fb0" as const,
        dashed: true,
        fillOpacity: 0.06,
        data: toFeatureCollection(otherZones),
      },
    ],
    [otherZones],
  )
  const emptyFit = useMemo(() => bboxOfGeometries(otherZones.map((z) => z.geojson)), [otherZones])

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <input type="hidden" name="municipality_id" value={municipalityId} />
      <FormStatus error={state.error} />

      <Section title="Dados da zona">
        <FieldGroup className="grid gap-4 sm:grid-cols-4">
          <TextField
            name="code"
            label="Código"
            placeholder="Ex.: ZO-1"
            defaultValue={initial.code}
            errors={errorsFor("code")}
          />
          <div className="sm:col-span-2">
            <TextField
              name="name"
              label="Nome"
              defaultValue={initial.name}
              errors={errorsFor("name")}
            />
          </div>
          <SelectField
            name="kind"
            label="Tipo"
            options={options(ZONE_KIND)}
            defaultValue={initial.kind ?? "zona"}
            errors={errorsFor("kind")}
          />
          <div className="sm:col-span-4">
            <SelectField
              name="legal_document_id"
              label="Lei que define a zona"
              options={documents.map(
                (d) => [d.id, `${LEGAL_DOCUMENT_KIND[d.kind]} nº ${d.number}`] as const,
              )}
              defaultValue={initial.legal_document_id ?? null}
              allowEmpty
              emptyLabel="Não informada"
              errors={errorsFor("legal_document_id")}
            />
          </div>
        </FieldGroup>
        <TextareaField
          name="description"
          label="Descrição"
          rows={2}
          defaultValue={initial.description ?? ""}
          errors={errorsFor("description")}
        />
      </Section>

      <Section
        title="Perímetro"
        description="Opcional. Importe o GeoJSON/KML da prefeitura ou desenhe. Sem perímetro, a zona só é atribuída manualmente aos lotes."
      >
        <GeometryEditor
          name="geometry"
          replaceFlagName="replace_geometry"
          initial={(initial.geojson as MultiPolygonGeometry | null) ?? null}
          overlays={overlays}
          emptyFitBounds={emptyFit}
          errors={errorsFor("geometry")}
        />
      </Section>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
