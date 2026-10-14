"use client"

import { Archive, ArchiveRestore, Download, Loader2, Search } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { SelectField } from "@/components/forms/fields"
import { TextField } from "@/components/forms/text-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LEGAL_DOCUMENT_KIND } from "@/lib/domain/labels"
import { EMPTY_SELECT_VALUE } from "@/lib/forms"
import type { ResumoCamada } from "@/lib/geo/importacao"
import type { Enums } from "@/lib/supabase/database.types"
import {
  arquivarFicticios,
  importarCamada,
  importarZonas,
  previsualizarCamada,
} from "@/server/admin/cartografia"

const TIPOS: [Enums<"environmental_layer_kind">, string][] = [
  ["zona_protecao_ambiental", "Zona de proteção ambiental (ZPA, ZIA, ZRA)"],
  ["area_alagavel", "Área alagável"],
  ["app", "APP"],
  ["tombamento", "Tombamento e entorno"],
  ["faixa_nao_edificavel", "Faixa não edificável"],
  ["faixa_dominio", "Faixa de domínio"],
  ["outro", "Outra (recurso hídrico, risco, zona especial…)"],
]

function fontePadrao(url: string): string {
  const m = url.match(/mapas\.fortaleza\.ce\.gov\.br\/api\/download\/geojson\/(\d+)/)
  if (m) return `Fortaleza em Mapas (Ipplan/SEUMA), mapa ${m[1]}`
  try {
    return new URL(url).hostname
  } catch {
    return ""
  }
}

type Zona = { nome: string; sigla: string; feicoes: number; descricao: string }

/**
 * Importa zonas e condicionantes de um portal oficial (GeoJSON por URL):
 * analisa, mostra os atributos para o admin escolher e grava em lote.
 */
export function ImportarCartografia({
  municipioId,
  documentos,
}: {
  municipioId: string
  documentos: { id: string; kind: Enums<"legal_document_kind">; number: string }[]
}) {
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState("")
  const [resumo, setResumo] = useState<ResumoCamada | null>(null)
  const [destino, setDestino] = useState<"zonas" | "camada">("camada")
  const [atributo, setAtributo] = useState<string | null>(null)
  const [zonas, setZonas] = useState<Zona[]>([])
  const [fonte, setFonte] = useState("")

  function analisar(nome?: string) {
    startTransition(async () => {
      const r = await previsualizarCamada(url, nome)
      if (!r.ok) return void toast.error(r.erro)
      setResumo(r.resumo)
      setZonas(r.zonas)
      // Nova URL (não só troca de atributo): fonte proposta a partir dela.
      if (!nome) setFonte(fontePadrao(url))
    })
  }

  function importar(form: FormData) {
    startTransition(async () => {
      const r =
        destino === "zonas"
          ? await importarZonas({
              municipioId,
              url,
              atributoNome: atributo ?? "",
              fonte,
              documentoId: ((v) => (v && v !== EMPTY_SELECT_VALUE ? v : null))(
                String(form.get("documento") ?? ""),
              ),
              siglas: Object.fromEntries(
                zonas.map((z) => [z.nome, String(form.get(`sigla:${z.nome}`) ?? z.sigla)]),
              ),
            })
          : await importarCamada({
              municipioId,
              url,
              kind: form.get("tipo_camada") as Enums<"environmental_layer_kind">,
              atributoNome: atributo,
              prefixo: String(form.get("prefixo") || "") || null,
              fonte,
            })
      if (r.ok) toast.success(r.mensagem)
      else toast.error(r.erro)
    })
  }

  const propriedades = resumo?.propriedades ?? []

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          setAtributo(null)
          setZonas([])
          setFonte("")
          analisar()
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://mapas.fortaleza.ce.gov.br/api/download/geojson/604"
          aria-label="URL do GeoJSON oficial"
        />
        <Button type="submit" variant="outline" disabled={pending || !url.trim()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}{" "}
          Analisar
        </Button>
      </form>

      {resumo && (
        <form action={importar} className="space-y-4 rounded-lg border p-3">
          <p className="text-sm">
            {resumo.feicoes} feições ({resumo.tiposGeometria.join(", ")}). {resumo.poligonos}{" "}
            poligonais serão importadas; linhas e pontos ficam de fora.
          </p>
          <div className="overflow-x-auto rounded-md border text-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Atributo</TableHead>
                  <TableHead>Valores distintos</TableHead>
                  <TableHead>Exemplos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propriedades.map((p) => (
                  <TableRow key={p.nome}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.distintos}</TableCell>
                    <TableCell className="max-w-md truncate">{p.exemplos.join(" · ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="destino"
              label="Importar como"
              options={[
                ["camada", "Camada de condicionantes"],
                ["zonas", "Zonas (zoneamento)"],
              ]}
              defaultValue={destino}
              onValueChange={(v) => setDestino(v as "zonas" | "camada")}
            />
            <SelectField
              name="atributo"
              label={
                destino === "zonas"
                  ? "Atributo com o nome da zona"
                  : "Atributo com o nome da feição (opcional)"
              }
              options={propriedades.map((p) => [p.nome, p.nome] as const)}
              allowEmpty={destino === "camada"}
              onValueChange={(v) => {
                const nome = v === EMPTY_SELECT_VALUE ? null : v
                setAtributo(nome)
                if (destino === "zonas" && nome) analisar(nome)
              }}
            />
            <TextField
              name="fonte"
              label="Fonte (fica registrada)"
              value={fonte}
              onChange={(e) => setFonte(e.target.value)}
            />
            {destino === "camada" ? (
              <>
                <SelectField
                  name="tipo_camada"
                  label="Tipo de condicionante"
                  options={TIPOS}
                  defaultValue="zona_protecao_ambiental"
                />
                <TextField
                  name="prefixo"
                  label="Prefixo do nome (opcional)"
                  placeholder="Ex.: Recurso hídrico (verificar APP)"
                />
              </>
            ) : (
              <SelectField
                name="documento"
                label="Lei que define as zonas (opcional)"
                options={documentos.map(
                  (d) => [d.id, `${LEGAL_DOCUMENT_KIND[d.kind]} nº ${d.number}`] as const,
                )}
                allowEmpty
              />
            )}
          </div>

          {destino === "zonas" && zonas.length > 0 && (
            <div className="overflow-x-auto rounded-md border text-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome na camada</TableHead>
                    <TableHead className="w-48">Sigla (código da zona)</TableHead>
                    <TableHead>Feições</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zonas.map((z) => (
                    <TableRow key={z.nome}>
                      <TableCell>
                        {z.nome}
                        {z.descricao && (
                          <p className="max-w-lg truncate text-xs text-muted-foreground">
                            {z.descricao}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          name={`sigla:${z.nome}`}
                          defaultValue={z.sigla}
                          aria-label={`Sigla de ${z.nome}`}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="tabular-nums">{z.feicoes}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Button
            type="submit"
            disabled={
              pending ||
              (destino === "zonas" && (!atributo || zonas.length === 0)) ||
              fonte.length < 3
            }
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}{" "}
            Importar
          </Button>
        </form>
      )}
    </div>
  )
}

export function ArquivarFicticios({
  municipioId,
  temFicticios,
}: {
  municipioId: string
  temFicticios: boolean
}) {
  const [pending, startTransition] = useTransition()
  const executar = (arquivar: boolean) =>
    startTransition(async () => {
      const r = await arquivarFicticios(municipioId, arquivar)
      if (r.ok) toast.success(r.mensagem)
      else toast.error(r.erro)
    })
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending || !temFicticios}
        onClick={() => {
          if (
            window.confirm(
              "Arquivar os dados fictícios? Eles saem das buscas, do copiloto e dos estudos; dá para restaurar.",
            )
          ) {
            executar(true)
          }
        }}
      >
        <Archive aria-hidden /> Arquivar dados fictícios
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => executar(false)}>
        <ArchiveRestore aria-hidden /> Restaurar
      </Button>
    </div>
  )
}
