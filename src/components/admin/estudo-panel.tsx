"use client"

import { Calculator, CircleAlert, Info, Loader2, Trophy, TriangleAlert } from "lucide-react"
import { useId, useState, useTransition } from "react"

import { Section } from "@/components/admin/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LAND_USE } from "@/lib/domain/labels"
import {
  ENGINE_VERSION,
  type Limitante,
  type Metricas,
  type NivelRisco,
  type ResultadoViabilidade,
  type Uso,
} from "@/lib/feasibility"
import {
  formatArea,
  formatBRL,
  formatMeters,
  formatNumber,
  formatPercent,
  parseDecimal,
} from "@/lib/format"
import { formatarFonte, formatarValorPremissa } from "@/lib/format/fonte"
import { cn } from "@/lib/utils"
import { estudarTerreno, type EstudoUso, type RespostaEstudo } from "@/server/feasibility/actions"

const TODOS = "__todos__"

const DEFINICOES = {
  margem: "Margem líquida = lucro ÷ VGV total (inclui unidades de permuta física).",
  roi: "ROI = lucro ÷ exposição máxima de caixa (o capital que precisa ser aportado).",
  tir: "TIR anual equivalente à taxa interna do fluxo de caixa mensal.",
  payback: "Mês em que o caixa acumulado volta a ficar positivo (nominal).",
  exposicao: "Maior saldo negativo acumulado do fluxo: o aporte máximo necessário.",
} as const

const LIMITANTE: Record<Limitante, string> = {
  coeficiente_aproveitamento: "coeficiente de aproveitamento",
  taxa_ocupacao: "taxa de ocupação",
  recuos: "recuos",
  gabarito: "gabarito",
}

const NIVEL: Record<NivelRisco, { rotulo: string; classe: string }> = {
  baixo: { rotulo: "Risco baixo", classe: "border-transparent bg-accent text-accent-foreground" },
  medio: {
    rotulo: "Risco médio",
    classe: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  alto: {
    rotulo: "Risco alto",
    classe: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

export function EstudoPanel({
  landId,
  zonaCodigo,
  usos,
}: {
  landId: string
  zonaCodigo: string | null
  usos: { uso: Uso; permitido: boolean }[]
}) {
  const ids = { uso: useId(), preco: useId(), ca: useId() }
  const [uso, setUso] = useState<string>(TODOS)
  const [preco, setPreco] = useState("")
  const [usarCaMaximo, setUsarCaMaximo] = useState(false)
  const [resposta, setResposta] = useState<RespostaEstudo | null>(null)
  const [erroPreco, setErroPreco] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function rodar() {
    const precoNum = parseDecimal(preco)
    if (precoNum !== null && (Number.isNaN(precoNum) || precoNum <= 0)) {
      setErroPreco("Preço inválido. Use, por exemplo, 11.000.")
      return
    }
    setErroPreco(null)
    startTransition(async () => {
      setResposta(
        await estudarTerreno({
          landId,
          uso: uso === TODOS ? undefined : (uso as Uso),
          precoVendaM2: precoNum,
          // Só vira premissa do usuário quando marcado; senão vale o default.
          usarCaMaximo: usarCaMaximo || undefined,
        }),
      )
    })
  }

  // Ordem do ranking; estudos que não rodaram vão para o fim.
  const posicao = (u: Uso) => {
    const i = resposta?.ok === true ? resposta.ranking.findIndex((r) => r.uso === u) : -1
    return i === -1 ? Number.POSITIVE_INFINITY : i
  }
  const ordenados =
    resposta?.ok === true
      ? [...resposta.estudos].sort((a, b) => posicao(a.uso) - posicao(b.uso))
      : []

  return (
    <Section
      title="Estudo preliminar"
      description={`Motor de viabilidade v${ENGINE_VERSION}. Cada execução fica registrada para calibração com os analistas.`}
    >
      {usos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {zonaCodigo
            ? `A zona ${zonaCodigo} não tem regras validadas. Valide ao menos uma regra para rodar o estudo.`
            : "O lote não tem zona identificada. Atribua a zona manualmente no cadastro abaixo para rodar o estudo."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <label htmlFor={ids.uso} className="text-sm font-medium">
              Uso
            </label>
            <Select value={uso} onValueChange={setUso}>
              <SelectTrigger id={ids.uso} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os usos (melhor uso)</SelectItem>
                {usos.map((u) => (
                  <SelectItem key={u.uso} value={u.uso}>
                    {LAND_USE[u.uso]}
                    {!u.permitido && " (não permitido)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label htmlFor={ids.preco} className="text-sm font-medium">
              Preço de venda (R$/m², opcional)
            </label>
            <Input
              id={ids.preco}
              inputMode="decimal"
              placeholder="Mediana dos comparáveis"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              aria-invalid={erroPreco ? true : undefined}
              aria-describedby={erroPreco ? `${ids.preco}-erro` : undefined}
            />
            {erroPreco && (
              <p id={`${ids.preco}-erro`} role="alert" className="text-sm text-destructive">
                {erroPreco}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label htmlFor={ids.ca} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={ids.ca}
                checked={usarCaMaximo}
                onCheckedChange={(v) => setUsarCaMaximo(v === true)}
              />
              Usar CA máximo (outorga)
            </label>
            <Button type="button" onClick={rodar} disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Calculator aria-hidden />
              )}
              Rodar estudo
            </Button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="space-y-4">
        {resposta?.ok === false && (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {resposta.erro}
          </p>
        )}
        {resposta?.ok === true && resposta.ranking.length > 1 && (
          <RankingUsos ranking={resposta.ranking} />
        )}
        {ordenados.map((estudo, i) => (
          <EstudoCard key={estudo.uso} estudo={estudo} aberto={i === 0} />
        ))}
      </div>
    </Section>
  )
}

function RankingUsos({ ranking }: { ranking: Extract<RespostaEstudo, { ok: true }>["ranking"] }) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Trophy className="size-4 text-brand" aria-hidden /> Melhor uso recomendado
      </h3>
      <p className="text-xs text-muted-foreground">
        Ranking pela TIR anual do cenário base ajustada ao risco: TIR × (1 − score ÷ 100).
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Uso</TableHead>
              <TableHead className="text-right">TIR anual</TableHead>
              <TableHead className="text-right">Margem</TableHead>
              <TableHead className="text-right">Risco</TableHead>
              <TableHead className="text-right">Índice</TableHead>
              <TableHead>Observação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranking.map((c, i) => (
              <TableRow key={c.uso} className={c.elegivel ? undefined : "text-muted-foreground"}>
                <TableCell className="tabular-nums">{c.elegivel ? i + 1 : "—"}</TableCell>
                <TableCell className="font-medium">{LAND_USE[c.uso]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(c.tirAnual)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(c.margemVgv)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.scoreRisco}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPercent(c.indice)}</TableCell>
                <TableCell className="text-xs">{c.elegivel ? "" : c.motivo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function EstudoCard({ estudo, aberto }: { estudo: EstudoUso; aberto: boolean }) {
  if (!estudo.ok) {
    return (
      <details open={aberto} className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">
          {LAND_USE[estudo.uso]}: não foi possível rodar
        </summary>
        <ListaAvisos titulo="Pendências" itens={estudo.pendencias} destaque />
        <ListaAvisos titulo="Avisos" itens={estudo.avisos} />
      </details>
    )
  }
  const r = estudo.resultado
  const m = r.base?.metricas
  return (
    <details open={aberto} className="group rounded-lg border p-4">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 font-semibold">
        {LAND_USE[r.uso]}
        <Badge variant="outline" className={NIVEL[r.risco.nivel].classe}>
          {NIVEL[r.risco.nivel].rotulo} · {r.risco.score}
        </Badge>
        {r.status !== "ok" && (
          <Badge variant="outline" className="text-muted-foreground">
            {r.status === "uso_nao_permitido" ? "Uso não permitido" : "Incompleto"}
          </Badge>
        )}
        {m && (
          <span className="text-sm font-normal text-muted-foreground">
            margem {formatPercent(m.margemVgv)} · TIR {formatPercent(m.tirAnual)} a.a.
          </span>
        )}
      </summary>

      <div className="mt-4 space-y-5">
        <ListaAvisos titulo="Pendências" itens={r.pendencias} destaque />

        {m && r.base && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi rotulo="VGV" valor={formatBRL(r.base.vgv, { compact: true })} />
            <Kpi rotulo="Custo total" valor={formatBRL(m.custoTotal, { compact: true })} />
            <Kpi
              rotulo="Lucro"
              valor={formatBRL(m.lucro, { compact: true })}
              negativo={m.lucro < 0}
            />
            <Kpi
              rotulo="Margem líquida"
              valor={formatPercent(m.margemVgv)}
              definicao={DEFINICOES.margem}
            />
            <Kpi rotulo="ROI" valor={formatPercent(m.roi)} definicao={DEFINICOES.roi} />
            <Kpi rotulo="TIR anual" valor={formatPercent(m.tirAnual)} definicao={DEFINICOES.tir} />
            <Kpi
              rotulo="Payback"
              valor={m.paybackMeses === null ? "Não retorna" : `${m.paybackMeses} meses`}
              definicao={DEFINICOES.payback}
            />
            <Kpi
              rotulo="Exposição máxima"
              valor={formatBRL(m.exposicaoMaxima, { compact: true })}
              definicao={DEFINICOES.exposicao}
            />
          </dl>
        )}

        {r.potencial && (
          <p className="text-sm">
            <strong>{formatArea(r.potencial.areaComputavelM2)}</strong> computáveis (CA{" "}
            {formatNumber(r.potencial.caAplicado)}
            {r.potencial.usaOutorga ? ", com outorga" : ""}) em {r.potencial.pavimentos}{" "}
            pavimento(s) de {formatMeters(r.potencial.alturaM)}; limitado por{" "}
            <strong>{LIMITANTE[r.potencial.limitante]}</strong>, projeção limitada por{" "}
            {LIMITANTE[r.potencial.projecaoLimitadaPor]}. {formatArea(r.potencial.areaPrivativaM2)}{" "}
            privativos.
          </p>
        )}

        {r.cenarios.length > 0 && <TabelaCenarios cenarios={r.cenarios} />}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Fatores de risco (score {r.risco.score} de 100)</h4>
          {r.risco.flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma flag disparou.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {r.risco.flags.map((f) => (
                <li key={f.codigo} className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    <strong>{f.rotulo}</strong> (+{f.peso}): {f.detalhe}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ListaAvisos titulo="Avisos" itens={estudo.avisos} />

        <details className="rounded-lg border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            Premissas e fontes ({r.premissas.length})
          </summary>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Premissa</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Fonte</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.premissas.map((p) => (
                  <TableRow key={p.chave}>
                    <TableCell>{p.rotulo}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarValorPremissa(p)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal text-muted-foreground">
                      {formatarFonte(p.fonte)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </details>

        <p className="text-xs text-muted-foreground italic">{r.disclaimer}</p>
      </div>
    </details>
  )
}

function Kpi({
  rotulo,
  valor,
  definicao,
  negativo,
}: {
  rotulo: string
  valor: string
  definicao?: string
  negativo?: boolean
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {rotulo}
        {definicao && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`O que é ${rotulo}`} className="rounded-full">
                <Info className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{definicao}</TooltipContent>
          </Tooltip>
        )}
      </dt>
      <dd className={cn("text-lg font-semibold tabular-nums", negativo && "text-destructive")}>
        {valor}
      </dd>
    </div>
  )
}

function TabelaCenarios({ cenarios }: { cenarios: ResultadoViabilidade["cenarios"] }) {
  const ordem = ["conservador", "base", "otimista"] as const
  const porNome = Object.fromEntries(cenarios.map((c) => [c.cenario, c]))
  const linhas: [string, (m: Metricas) => string][] = [
    ["VGV", (m) => formatBRL(m.vgv, { compact: true })],
    ["Custo total", (m) => formatBRL(m.custoTotal, { compact: true })],
    ["Lucro", (m) => formatBRL(m.lucro, { compact: true })],
    ["Margem líquida", (m) => formatPercent(m.margemVgv)],
    ["ROI", (m) => formatPercent(m.roi)],
    ["TIR anual", (m) => formatPercent(m.tirAnual)],
    ["Payback", (m) => (m.paybackMeses === null ? "—" : `${m.paybackMeses} meses`)],
  ]
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Indicador</TableHead>
            <TableHead className="text-right">Conservador</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">Otimista</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map(([rotulo, fmt]) => (
            <TableRow key={rotulo}>
              <TableCell>{rotulo}</TableCell>
              {ordem.map((nome) => (
                <TableCell
                  key={nome}
                  className={cn("text-right tabular-nums", nome === "base" && "font-semibold")}
                >
                  {porNome[nome] ? fmt(porNome[nome].metricas) : "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Conservador: preço {formatPercent(porNome.conservador?.deltas.preco ?? 0)}, custo +
        {formatPercent(porNome.conservador?.deltas.custo ?? 0)}, vendas{" "}
        {formatPercent(porNome.conservador?.deltas.prazoVendas ?? 0)} mais lentas. Otimista: preço +
        {formatPercent(porNome.otimista?.deltas.preco ?? 0)}, custo{" "}
        {formatPercent(porNome.otimista?.deltas.custo ?? 0)}, vendas{" "}
        {formatPercent(Math.abs(porNome.otimista?.deltas.prazoVendas ?? 0))} mais rápidas.
      </p>
    </div>
  )
}

function ListaAvisos({
  titulo,
  itens,
  destaque,
}: {
  titulo: string
  itens: string[]
  destaque?: boolean
}) {
  if (itens.length === 0) return null
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border px-3 py-2 text-sm",
        destaque ? "border-destructive/30 bg-destructive/10" : "bg-muted/40",
      )}
    >
      <p className="font-semibold">{titulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
