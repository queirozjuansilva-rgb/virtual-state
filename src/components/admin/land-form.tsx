"use client"

import { CircleAlert, Loader2, MapPinned, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"

import { GeometryEditor } from "@/components/admin/geometry-editor"
import { Section } from "@/components/admin/page-header"
import { CheckboxField, SelectField, TextareaField } from "@/components/forms/fields"
import { FormStatus } from "@/components/forms/form-status"
import { TextField } from "@/components/forms/text-field"
import { useFormAction } from "@/components/forms/use-form-action"
import type { MapOverlay } from "@/components/map/geo-map"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import {
  ENVIRONMENTAL_LAYER_KIND,
  LAND_SHAPE,
  LAND_STATUS,
  NEGOTIATION_TYPE,
  options,
  TOPOGRAPHY,
} from "@/lib/domain/labels"
import { formatArea, formatPercent, toInputNumber } from "@/lib/format"
import type { FormState } from "@/lib/forms"
import { bboxOfGeometries, toFeatureCollection } from "@/lib/geo/feature-collection"
import type { MultiPolygonGeometry } from "@/lib/geo/geojson"
import type { Enums, Tables } from "@/lib/supabase/database.types"
import { previewLandGeometry, type GeometryPreview } from "@/server/admin/actions"

type Owner = {
  owner_name: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

export type LandFormInitial = Partial<Tables<"lands">> & { owner?: Owner | null }

type ZoneRef = { id: string; code: string; name: string; municipality_id: string; geojson: unknown }
type LayerRef = {
  id: string
  kind: Enums<"environmental_layer_kind">
  name: string
  municipality_id: string
  geojson: unknown
}

export function LandForm({
  action,
  initial,
  municipalities,
  zones,
  layers,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  initial: LandFormInitial
  municipalities: { id: string; name: string; uf: string }[]
  zones: ZoneRef[]
  layers: LayerRef[]
  submitLabel: string
}) {
  const { state, pending, onSubmit, errorsFor } = useFormAction(action)
  const [municipalityId, setMunicipalityId] = useState(
    initial.municipality_id ?? (municipalities.length === 1 ? municipalities[0]!.id : ""),
  )
  const [geometry, setGeometry] = useState<MultiPolygonGeometry | null>(
    (initial.geojson as MultiPolygonGeometry | null) ?? null,
  )
  const [assignment, setAssignment] = useState<string>(initial.zone_assignment ?? "automatica")
  const [negotiation, setNegotiation] = useState<string>(initial.negociacao ?? "")
  const preview = useGeometryPreview(geometry, municipalityId)

  const municipalityZones = useMemo(
    () => zones.filter((z) => z.municipality_id === municipalityId),
    [zones, municipalityId],
  )
  const overlays = useMemo<MapOverlay[]>(
    () => [
      {
        id: "zones",
        label: "Zonas cadastradas",
        color: "#4f9fb0",
        dashed: true,
        fillOpacity: 0.06,
        data: toFeatureCollection(municipalityZones, (z) => ({ code: z.code })),
      },
      {
        id: "environmental",
        label: "Restrições ambientais (APP, área alagável…)",
        color: "#d97706",
        fillOpacity: 0.2,
        data: toFeatureCollection(layers.filter((l) => l.municipality_id === municipalityId)),
      },
    ],
    [municipalityZones, layers, municipalityId],
  )
  const emptyFit = useMemo(
    () => bboxOfGeometries(municipalityZones.map((z) => z.geojson)),
    [municipalityZones],
  )

  const usesPermuta =
    negotiation !== "" && negotiation !== "dinheiro" && negotiation !== "__vazio__"

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormStatus error={state.error} />

      <Section title="Identificação">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="code"
            label="Código interno"
            defaultValue={initial.code ?? ""}
            errors={errorsFor("code")}
            required
          />
          <SelectField
            name="municipality_id"
            label="Município"
            options={municipalities.map((m) => [m.id, `${m.name}/${m.uf}`] as const)}
            defaultValue={municipalityId || null}
            onValueChange={setMunicipalityId}
            errors={errorsFor("municipality_id")}
          />
          <TextField
            name="address"
            label="Endereço"
            defaultValue={initial.address ?? ""}
            errors={errorsFor("address")}
            required
          />
          <TextField
            name="neighborhood"
            label="Bairro"
            defaultValue={initial.neighborhood ?? ""}
            errors={errorsFor("neighborhood")}
          />
          <TextField
            name="cep"
            label="CEP"
            inputMode="numeric"
            defaultValue={initial.cep ?? ""}
            errors={errorsFor("cep")}
          />
        </FieldGroup>
      </Section>

      <Section
        title="Polígono do lote"
        description="Desenhe o lote no mapa ou importe um arquivo. A zona é identificada pela maior área de interseção."
      >
        <GeometryEditor
          name="geometry"
          initial={geometry}
          overlays={overlays}
          errors={errorsFor("geometry")}
          onChange={setGeometry}
          emptyFitBounds={emptyFit}
        />
        <ZonePreview preview={preview} hasGeometry={Boolean(geometry)} />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="area_informada_m2"
            label="Área informada (sobrescreve a calculada)"
            unit="m²"
            inputMode="decimal"
            defaultValue={toInputNumber(initial.area_informada_m2)}
            description="Deixe vazio para usar a área do polígono."
            errors={errorsFor("area_informada_m2")}
          />
          <SelectField
            name="zone_assignment"
            label="Zoneamento"
            options={[
              ["automatica", "Automático (interseção com as zonas)"],
              ["manual", "Manual (escolher a zona)"],
            ]}
            defaultValue={assignment}
            onValueChange={setAssignment}
            errors={errorsFor("zone_assignment")}
          />
          {assignment === "manual" && (
            <SelectField
              name="zone_id"
              label="Zona"
              options={municipalityZones.map((z) => [z.id, `${z.code}: ${z.name}`] as const)}
              defaultValue={initial.zone_id ?? null}
              description="Atribuição manual vira flag de risco no estudo."
              errors={errorsFor("zone_id")}
            />
          )}
        </FieldGroup>
      </Section>

      <Section title="Características físicas">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="testada_principal_m"
            label="Testada principal"
            unit="m"
            inputMode="decimal"
            defaultValue={toInputNumber(initial.testada_principal_m)}
            errors={errorsFor("testada_principal_m")}
          />
          <TextField
            name="testadas_m"
            label="Outras testadas"
            placeholder="Ex.: 20; 12,5"
            defaultValue={(initial.testadas_m ?? []).map((t) => toInputNumber(t)).join("; ")}
            errors={errorsFor("testadas_m")}
          />
          <SelectField
            name="formato"
            label="Formato"
            options={options(LAND_SHAPE)}
            defaultValue={initial.formato ?? null}
            allowEmpty
            emptyLabel="Não informado"
            errors={errorsFor("formato")}
          />
          <SelectField
            name="topografia"
            label="Topografia"
            options={options(TOPOGRAPHY)}
            defaultValue={initial.topografia ?? null}
            allowEmpty
            emptyLabel="Não informada"
            errors={errorsFor("topografia")}
          />
          <TextField
            name="declividade_pct"
            label="Declividade"
            unit="%"
            inputMode="decimal"
            defaultValue={toInputNumber(initial.declividade_pct)}
            errors={errorsFor("declividade_pct")}
          />
          <div className="flex items-end pb-2">
            <CheckboxField
              name="esquina"
              label="Lote de esquina"
              defaultChecked={initial.esquina ?? false}
            />
          </div>
        </FieldGroup>
      </Section>

      <Section title="Situação e documentação">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="status"
            label="Situação"
            options={options(LAND_STATUS)}
            defaultValue={initial.status ?? "disponivel"}
            description="Só terrenos disponíveis aparecem para os membros."
            errors={errorsFor("status")}
          />
          <TextField
            name="matricula_numero"
            label="Nº da matrícula"
            defaultValue={initial.matricula_numero ?? ""}
            description="Sem matrícula, o estudo sinaliza risco jurídico."
            errors={errorsFor("matricula_numero")}
          />
          <TextField
            name="cartorio"
            label="Cartório"
            defaultValue={initial.cartorio ?? ""}
            errors={errorsFor("cartorio")}
          />
        </FieldGroup>
        <TextareaField
          name="onus"
          label="Ônus conhecidos"
          rows={2}
          defaultValue={initial.onus ?? ""}
          errors={errorsFor("onus")}
        />
      </Section>

      <Section title="Condições comerciais">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="preco_pedido"
            label="Preço pedido"
            unit="R$"
            inputMode="decimal"
            defaultValue={toInputNumber(initial.preco_pedido)}
            errors={errorsFor("preco_pedido")}
          />
          <SelectField
            name="negociacao"
            label="Forma de negociação"
            options={options(NEGOTIATION_TYPE)}
            defaultValue={initial.negociacao ?? null}
            allowEmpty
            emptyLabel="Não informada"
            onValueChange={setNegotiation}
            errors={errorsFor("negociacao")}
          />
          {usesPermuta && (
            <TextField
              name="permuta_pct"
              label="Percentual de permuta"
              unit="%"
              inputMode="decimal"
              defaultValue={toInputNumber(initial.permuta_pct, 100)}
              description="Do VGV ou das unidades."
              errors={errorsFor("permuta_pct")}
            />
          )}
        </FieldGroup>
      </Section>

      <Section
        title="Restrições físico-ambientais"
        description="Checklist manual. Interseções com camadas cadastradas (APP, área alagável…) aparecem automaticamente acima."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <CheckboxField name="tem_app" label="APP" defaultChecked={initial.tem_app ?? false} />
          <CheckboxField
            name="tem_area_alagavel"
            label="Área alagável"
            defaultChecked={initial.tem_area_alagavel ?? false}
          />
          <CheckboxField
            name="tem_faixa_dominio"
            label="Faixa de domínio"
            defaultChecked={initial.tem_faixa_dominio ?? false}
          />
          <CheckboxField
            name="tem_tombamento"
            label="Tombamento"
            defaultChecked={initial.tem_tombamento ?? false}
          />
          <CheckboxField
            name="tem_servidao"
            label="Servidão"
            defaultChecked={initial.tem_servidao ?? false}
          />
        </div>
        <TextareaField
          name="restricoes_obs"
          label="Observações sobre restrições"
          rows={2}
          defaultValue={initial.restricoes_obs ?? ""}
          errors={errorsFor("restricoes_obs")}
        />
      </Section>

      <Section title="Proprietário" description="Visível apenas para administradores.">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <TextField
            name="owner_name"
            label="Nome"
            defaultValue={initial.owner?.owner_name ?? ""}
            errors={errorsFor("owner_name")}
          />
          <TextField
            name="owner_phone"
            label="Telefone"
            inputMode="tel"
            defaultValue={initial.owner?.phone ?? ""}
            errors={errorsFor("owner_phone")}
          />
          <TextField
            name="owner_email"
            label="E-mail"
            type="email"
            defaultValue={initial.owner?.email ?? ""}
            errors={errorsFor("owner_email")}
          />
        </FieldGroup>
        <TextareaField
          name="owner_notes"
          label="Anotações sobre o contato"
          rows={2}
          defaultValue={initial.owner?.notes ?? ""}
          errors={errorsFor("owner_notes")}
        />
      </Section>

      <Section title="Observações gerais">
        <TextareaField
          name="observacoes"
          label="Observações"
          rows={3}
          defaultValue={initial.observacoes ?? ""}
          errors={errorsFor("observacoes")}
        />
      </Section>

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        {state.error && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <CircleAlert className="size-4" aria-hidden /> {state.error}
          </span>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** Consulta zonas e camadas ambientais do polígono (com debounce). */
function useGeometryPreview(geometry: MultiPolygonGeometry | null, municipalityId: string) {
  const [preview, setPreview] = useState<(GeometryPreview & { loading: boolean }) | null>(null)
  const [, startTransition] = useTransition()
  const requestId = useRef(0)

  useEffect(() => {
    if (!geometry || !municipalityId) return
    const id = ++requestId.current
    const timer = setTimeout(() => {
      startTransition(async () => {
        setPreview((p) =>
          p ? { ...p, loading: true } : { zones: [], environmental: [], loading: true },
        )
        const result = await previewLandGeometry(geometry, municipalityId)
        if (id === requestId.current) setPreview({ ...result, loading: false })
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [geometry, municipalityId])

  return geometry && municipalityId ? preview : null
}

function ZonePreview({
  preview,
  hasGeometry,
}: {
  preview: (GeometryPreview & { loading: boolean }) | null
  hasGeometry: boolean
}) {
  if (!hasGeometry) return null
  if (!preview || (preview.loading && preview.zones.length === 0)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Identificando zona…
      </p>
    )
  }
  if (preview.error) {
    return <p className="text-sm text-destructive">{preview.error}</p>
  }
  const [main, ...others] = preview.zones
  return (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm" aria-live="polite">
      {main ? (
        <p className="flex items-start gap-2">
          <MapPinned className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>
            Zona identificada: <strong>{main.code}</strong> ({main.name}),{" "}
            {formatPercent(main.overlap_ratio)} da área do lote.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Nenhuma zona cadastrada cruza o lote. Use a atribuição manual.
        </p>
      )}
      {others.length > 0 && (
        <p className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />O lote também cruza{" "}
          {others.map((z) => `${z.code} (${formatPercent(z.overlap_ratio)})`).join(", ")}. Vale a
          zona de maior área; o estudo sinaliza o risco.
        </p>
      )}
      {preview.environmental.map((hit) => (
        <p
          key={`${hit.kind}-${hit.name}`}
          className="flex items-start gap-2 text-amber-800 dark:text-amber-300"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {ENVIRONMENTAL_LAYER_KIND[hit.kind as Enums<"environmental_layer_kind">] ??
            hit.kind}: {hit.name}, {formatArea(hit.overlap_m2)} de sobreposição
          {hit.is_fictitious ? " (camada fictícia)" : ""}.
        </p>
      ))}
    </div>
  )
}
