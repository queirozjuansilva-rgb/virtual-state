"use client"

import "maplibre-gl/dist/maplibre-gl.css"

import { Eraser, MousePointer2, PenLine } from "lucide-react"
import type { Map as MapLibreMap } from "maplibre-gl"
import { useEffect, useRef, useState } from "react"
import type { TerraDraw } from "terra-draw"

import { Button } from "@/components/ui/button"
import type { MultiPolygonGeometry } from "@/lib/geo/geojson"
import { cn } from "@/lib/utils"

import { DEFAULT_CENTER, mapStyle } from "./map-style"

export type MapOverlay = {
  id: string
  label: string
  color: `#${string}`
  data: GeoJSON.GeoJSON | null
  fillOpacity?: number
  dashed?: boolean
}

type GeoMapProps = {
  ariaLabel: string
  overlays?: MapOverlay[]
  /** Enquadra o mapa nesta caixa [oeste, sul, leste, norte] quando muda. */
  fitBounds?: [number, number, number, number] | null
  /** Modo edição: polígono do lote controlado pelo componente pai. */
  editable?: boolean
  value?: MultiPolygonGeometry | null
  onChange?: (value: MultiPolygonGeometry | null) => void
  className?: string
}

type DrawMode = "static" | "polygon" | "select"

const MAPLIBRE_WORKER_URL = "/vendor/maplibre-gl-worker.mjs"

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }

export function GeoMap({
  ariaLabel,
  overlays = [],
  fitBounds,
  editable = false,
  value = null,
  onChange,
  className,
}: GeoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)
  const lastValueKey = useRef<string>("null")
  const onChangeRef = useRef(onChange)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<DrawMode>("static")

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Cria o mapa (e o desenho, no modo edição) uma única vez.
  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | undefined

    async function init() {
      const { Map, NavigationControl, setWorkerUrl } = await import("maplibre-gl")
      if (cancelled || !containerRef.current) return
      // Worker copiado no postinstall (scripts/copy-maplibre-worker.mjs).
      setWorkerUrl(MAPLIBRE_WORKER_URL)
      map = new Map({
        container: containerRef.current,
        style: mapStyle(),
        center: DEFAULT_CENTER,
        zoom: 13,
        attributionControl: { compact: true },
      })
      map.addControl(new NavigationControl({ showCompass: false }), "top-right")
      map.once("load", async () => {
        if (cancelled || !map) return
        mapRef.current = map
        if (editable) drawRef.current = await createDraw(map, emit)
        setReady(true)
      })
    }

    function emit(draw: TerraDraw) {
      const polygons = draw
        .getSnapshot()
        .filter((f) => f.geometry.type === "Polygon" && !f.properties.currentlyDrawing)
        .map((f) => (f.geometry as GeoJSON.Polygon).coordinates as [number, number][][])
      const next: MultiPolygonGeometry | null = polygons.length
        ? { type: "MultiPolygon", coordinates: polygons }
        : null
      lastValueKey.current = JSON.stringify(next)
      onChangeRef.current?.(next)
    }

    void init()
    return () => {
      cancelled = true
      drawRef.current?.stop()
      drawRef.current = null
      map?.remove()
      mapRef.current = null
    }
    // O mapa é criado uma vez; mudanças de props são aplicadas pelos efeitos abaixo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Camadas de referência (zonas, APP, terrenos vizinhos…).
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const beforeId = map.getStyle().layers.find((l) => l.id.startsWith("td-"))?.id
    for (const overlay of overlays) {
      const sourceId = `overlay-${overlay.id}`
      const data = (overlay.data ?? EMPTY) as GeoJSON.GeoJSON
      const source = map.getSource(sourceId) as
        { setData?: (d: GeoJSON.GeoJSON) => void } | undefined
      if (source?.setData) {
        source.setData(data)
        continue
      }
      map.addSource(sourceId, { type: "geojson", data })
      map.addLayer(
        {
          id: `${sourceId}-fill`,
          type: "fill",
          source: sourceId,
          paint: { "fill-color": overlay.color, "fill-opacity": overlay.fillOpacity ?? 0.15 },
        },
        beforeId,
      )
      map.addLayer(
        {
          id: `${sourceId}-line`,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": overlay.color,
            "line-width": 2,
            ...(overlay.dashed ? { "line-dasharray": [2, 2] } : {}),
          },
        },
        beforeId,
      )
    }
  }, [ready, overlays])

  // Valor vindo de fora (ex.: importação de arquivo) substitui o desenho.
  useEffect(() => {
    const draw = drawRef.current
    if (!ready || !draw) return
    const key = JSON.stringify(value)
    if (key === lastValueKey.current) return
    lastValueKey.current = key
    draw.clear()
    if (value) {
      draw.addFeatures(
        value.coordinates.map((coordinates) => ({
          id: draw.getFeatureId(),
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates },
          properties: { mode: "polygon" },
        })),
      )
    }
  }, [ready, value])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !fitBounds) return
    const [w, s, e, n] = fitBounds
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 48, maxZoom: 18, duration: 0 },
    )
  }, [ready, fitBounds])

  function changeMode(next: DrawMode) {
    drawRef.current?.setMode(next)
    setMode(next)
  }

  function clearDrawing() {
    const draw = drawRef.current
    if (!draw) return
    draw.clear()
    lastValueKey.current = "null"
    onChangeRef.current?.(null)
    changeMode("polygon")
  }

  return (
    <div className={cn("space-y-2", className)}>
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "polygon" ? "default" : "outline"}
            onClick={() => changeMode("polygon")}
            disabled={!ready}
          >
            <PenLine aria-hidden /> Desenhar
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "select" ? "default" : "outline"}
            onClick={() => changeMode("select")}
            disabled={!ready}
          >
            <MousePointer2 aria-hidden /> Editar vértices
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearDrawing} disabled={!ready}>
            <Eraser aria-hidden /> Limpar
          </Button>
          <span className="text-xs text-muted-foreground">
            {mode === "polygon"
              ? "Clique para marcar os vértices; clique no primeiro ponto para fechar."
              : mode === "select"
                ? "Clique no polígono e arraste os vértices."
                : "Escolha uma ferramenta para desenhar o lote."}
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        role="region"
        aria-label={ariaLabel}
        className="h-80 w-full overflow-hidden rounded-xl border bg-muted sm:h-96"
      />
      {overlays.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {overlays.map((o) => (
            <li key={o.id} className="flex items-center gap-1.5">
              <span
                className="size-3 rounded-sm border"
                style={{ backgroundColor: `${o.color}55`, borderColor: o.color }}
                aria-hidden
              />
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

async function createDraw(map: MapLibreMap, emit: (draw: TerraDraw) => void) {
  const [
    { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode, TerraDrawRenderMode },
    { TerraDrawMapLibreGLAdapter },
  ] = await Promise.all([import("terra-draw"), import("terra-draw-maplibre-gl-adapter")])

  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawRenderMode({ modeName: "static", styles: {} }),
      new TerraDrawPolygonMode({
        styles: {
          fillColor: "#0d968b",
          fillOpacity: 0.3,
          outlineColor: "#0a7d74",
          outlineWidth: 2,
        },
      }),
      new TerraDrawSelectMode({
        flags: {
          polygon: {
            feature: {
              draggable: true,
              coordinates: { midpoints: true, draggable: true, deletable: true },
            },
          },
        },
      }),
    ],
  })
  draw.start()
  draw.setMode("static")

  let timer: ReturnType<typeof setTimeout> | undefined
  draw.on("finish", () => emit(draw))
  draw.on("change", (_ids, type) => {
    if (type === "styling") return
    clearTimeout(timer)
    timer = setTimeout(() => emit(draw), 200)
  })
  return draw
}
