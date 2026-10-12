"use client"

import { FileUp } from "lucide-react"
import { useId, useMemo, useState } from "react"

import { GeoMap, type MapOverlay } from "@/components/map/geo-map"
import { FieldError } from "@/components/ui/field"
import { formatArea } from "@/lib/format"
import { geodesicArea } from "@/lib/geo/area"
import {
  bbox,
  GeoError,
  parseGeoJsonText,
  toMultiPolygon,
  type MultiPolygonGeometry,
} from "@/lib/geo/geojson"

async function readGeometryFile(file: File): Promise<MultiPolygonGeometry> {
  const text = await file.text()
  if (file.name.toLowerCase().endsWith(".kml")) {
    const { kml } = await import("@tmcw/togeojson")
    const doc = new DOMParser().parseFromString(text, "text/xml")
    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new GeoError("O arquivo KML está malformado.")
    }
    return toMultiPolygon(kml(doc))
  }
  return parseGeoJsonText(text)
}

/**
 * Editor de geometria: desenho no mapa + importação de GeoJSON/KML + área.
 * Publica o valor num input oculto (`name`) como GeoJSON string.
 */
export function GeometryEditor({
  name,
  initial,
  overlays,
  errors,
  onChange,
  emptyFitBounds,
  replaceFlagName,
}: {
  name: string
  initial: MultiPolygonGeometry | null
  overlays?: MapOverlay[]
  errors?: string[]
  onChange?: (geometry: MultiPolygonGeometry | null) => void
  /** Enquadramento quando ainda não há geometria (ex.: zonas do município). */
  emptyFitBounds?: [number, number, number, number] | null
  /** Se informado, marca no form que a geometria foi alterada (checkbox oculto). */
  replaceFlagName?: string
}) {
  const fileId = useId()
  const [geometry, setGeometry] = useState<MultiPolygonGeometry | null>(initial)
  const [changed, setChanged] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  // Enquadra no carregamento e depois de importar; não a cada vértice desenhado.
  const [fitTarget, setFitTarget] = useState(() =>
    initial ? bbox(initial) : (emptyFitBounds ?? null),
  )

  const area = useMemo(() => (geometry ? geodesicArea(geometry) : null), [geometry])

  function update(next: MultiPolygonGeometry | null) {
    setGeometry(next)
    setChanged(true)
    onChange?.(next)
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setImportError(null)
    try {
      const next = await readGeometryFile(file)
      update(next)
      setFitTarget(bbox(next))
    } catch (error) {
      setImportError(error instanceof GeoError ? error.message : "Não foi possível ler o arquivo.")
    }
  }

  const allErrors = [...(errors ?? []), ...(importError ? [importError] : [])]

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={geometry ? JSON.stringify(geometry) : ""} />
      {replaceFlagName && changed && <input type="hidden" name={replaceFlagName} value="on" />}

      <GeoMap
        ariaLabel="Mapa para desenhar o polígono"
        editable
        value={geometry}
        onChange={update}
        overlays={overlays}
        fitBounds={fitTarget}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label
          htmlFor={fileId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted"
        >
          <FileUp className="size-4" aria-hidden />
          Importar GeoJSON ou KML
          <input
            id={fileId}
            type="file"
            accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml"
            className="sr-only"
            onChange={handleFile}
          />
        </label>
        <p className="text-sm" aria-live="polite">
          {area !== null ? (
            <>
              Área desenhada: <strong>{formatArea(area)}</strong>{" "}
              <span className="text-muted-foreground">
                (prévia; o valor oficial é calculado ao salvar)
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Nenhum polígono ainda.</span>
          )}
        </p>
      </div>
      <FieldError errors={allErrors.map((message) => ({ message }))} />
    </div>
  )
}
