"use client"

import { useState } from "react"

import { GeoMap } from "@/components/map/geo-map"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import type { Ponto } from "./use-copiloto"

/** Escolha de um ponto no mapa (até a geocodificação de endereço chegar). */
export function SeletorPonto({
  aberto,
  onAbertoChange,
  inicial,
  onConfirmar,
}: {
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
  inicial: Ponto | null
  onConfirmar: (ponto: Ponto) => void
}) {
  const [ponto, setPonto] = useState<Ponto | null>(inicial)

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Selecionar localização</DialogTitle>
          <DialogDescription>
            Clique no mapa para marcar o terreno. O copiloto usa o ponto para identificar a zona e
            as restrições do local.
          </DialogDescription>
        </DialogHeader>
        {aberto && (
          <GeoMap
            ariaLabel="Mapa para selecionar o ponto do terreno"
            onMapClick={setPonto}
            marker={ponto}
            mapClassName="h-80"
          />
        )}
        <p className="text-xs text-muted-foreground tabular-nums">
          {ponto
            ? `Ponto: latitude ${ponto.latitude.toFixed(6)}, longitude ${ponto.longitude.toFixed(6)}`
            : "Nenhum ponto selecionado."}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!ponto}
            onClick={() => {
              if (ponto) onConfirmar(ponto)
              onAbertoChange(false)
            }}
          >
            Usar este ponto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
