"use client"

import Link from "next/link"
import {
  BadgeCheck,
  FileDown,
  FileText,
  Building2,
  ChevronRight,
  FlaskConical,
  Landmark,
  MapPin,
  MapPinned,
  Scale,
  ScrollText,
  TrendingUp,
  TriangleAlert,
} from "lucide-react"
import type { ReactNode } from "react"

import { AbrirRelatorio } from "@/components/estudo/abrir-relatorio"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type {
  Cartao,
  EstudoResumo,
  FonteTexto,
  ParametroValidado,
  ResultadoComparacao,
  ResultadoCobertura,
  ResultadoLegislacao,
  ResultadoLocalizacao,
  ResultadoMercado,
  ResultadoParametros,
  ResultadoRelatorio,
  ResultadoViabilidadeCopiloto,
  ResultadoZona,
  TerrenoDetalhe,
  TerrenoResumo,
} from "@/lib/ai/tipos"
import { cn } from "@/lib/utils"

/** Cartões do chat: renderizam o JSON das ferramentas, nunca texto livre do modelo. */
export function CartaoChat({
  cartao,
  onFoco,
}: {
  cartao: Cartao
  onFoco?: (terrenoId: string) => void
}) {
  switch (cartao.tipo) {
    case "lista_terrenos":
      return (
        <ListaTerrenos
          terrenos={cartao.dados.terrenos}
          filtros={cartao.dados.filtros}
          onFoco={onFoco}
        />
      )
    case "terreno":
      return <CartaoTerreno t={cartao.dados} onFoco={onFoco} />
    case "localizacao":
      return <CartaoLocalizacao l={cartao.dados} />
    case "zona":
      return <CartaoZona z={cartao.dados} />
    case "parametros":
      return <CartaoParametros p={cartao.dados} />
    case "mercado":
      return <CartaoMercado m={cartao.dados} />
    case "viabilidade":
      return <CartaoViabilidade v={cartao.dados} onFoco={onFoco} />
    case "comparacao":
      return <CartaoComparacao c={cartao.dados} />
    case "legislacao":
      return <CartaoLegislacao l={cartao.dados} />
    case "cobertura":
      return <CartaoCobertura c={cartao.dados} />
    case "relatorio":
      return <CartaoRelatorio r={cartao.dados} />
  }
}

// Peças comuns ------------------------------------------------------------------------

function Moldura({
  icone,
  titulo,
  subtitulo,
  selo,
  children,
  rodape,
}: {
  icone: ReactNode
  titulo: ReactNode
  subtitulo?: ReactNode
  selo?: ReactNode
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <span className="mt-0.5 text-brand [&_svg]:size-4.5" aria-hidden>
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {subtitulo && <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {selo}
      </header>
      <div className="space-y-3 px-4 py-3 text-sm">{children}</div>
      {rodape && (
        <footer className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          {rodape}
        </footer>
      )}
    </section>
  )
}

function Indicador({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: ReactNode
  destaque?: boolean
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        {rotulo}
      </dt>
      <dd className={cn("truncate text-sm font-semibold tabular-nums", destaque && "text-primary")}>
        {valor}
      </dd>
    </div>
  )
}

function Ficticio() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <FlaskConical aria-hidden />
      Fictício
    </Badge>
  )
}

/** Fonte comum a todos os parâmetros (caso típico: uma tabela da lei), para citar uma vez só. */
function fonteComum(parametros: ParametroValidado[]): FonteTexto | null {
  const primeira = parametros[0]?.fonte
  if (!primeira) return null
  return parametros.every((p) => p.fonte?.texto === primeira.texto) ? primeira : null
}

/** Valor do parâmetro; o trecho da lei aparece no tooltip. */
function ValorComTrecho({ valor, trecho }: { valor: string; trecho: string | null }) {
  if (!trecho) return <>{valor}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-left underline decoration-dotted underline-offset-2">
          {valor}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{trecho}</TooltipContent>
    </Tooltip>
  )
}

function TextoFonte({ fonte }: { fonte: FonteTexto | null }) {
  if (!fonte) return <span className="text-amber-700 dark:text-amber-300">sem fonte vinculada</span>
  return <span className={cn(fonte.ficticio && "italic")}>{fonte.texto}</span>
}

function Avisos({ itens, titulo = "Atenção" }: { itens: string[]; titulo?: string }) {
  if (itens.length === 0) return null
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
      <p className="flex items-center gap-1 font-semibold">
        <TriangleAlert className="size-3.5" aria-hidden />
        {titulo}
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {itens.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  )
}

const ESTILO_RISCO: Record<string, string> = {
  Baixo: "border-transparent bg-accent text-accent-foreground",
  Médio: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  Alto: "border-destructive/40 bg-destructive/10 text-destructive",
}

function SeloRisco({ nivel, score }: { nivel: string; score: number }) {
  return (
    <Badge variant="outline" className={ESTILO_RISCO[nivel]}>
      Risco {nivel.toLowerCase()} · {score}
    </Badge>
  )
}

// Terrenos ----------------------------------------------------------------------------

function ListaTerrenos({
  terrenos,
  filtros,
  onFoco,
}: {
  terrenos: TerrenoResumo[]
  filtros: string
  onFoco?: (id: string) => void
}) {
  return (
    <Moldura
      icone={<Building2 />}
      titulo={`${terrenos.length} ${terrenos.length === 1 ? "terreno" : "terrenos"} no land bank`}
      subtitulo={filtros}
    >
      <ul className="-mx-4 -my-3 divide-y">
        {terrenos.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium">
                {t.codigo}
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {[t.bairro, `${t.municipio}/${t.uf}`].filter(Boolean).join(" · ")}
                </span>
                {t.ficticio && <Ficticio />}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t.area_fmt} · {t.preco_fmt}
                {t.zona ? ` · ${t.zona}` : " · sem zona"} · {t.situacao}
              </p>
            </div>
            {onFoco && (
              <Button variant="ghost" size="sm" onClick={() => onFoco(t.id)}>
                Ver <ChevronRight aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Moldura>
  )
}

function CartaoTerreno({ t, onFoco }: { t: TerrenoDetalhe; onFoco?: (id: string) => void }) {
  return (
    <Moldura
      icone={<MapPin />}
      titulo={
        <span className="flex items-center gap-2">
          {t.codigo} {t.ficticio && <Ficticio />}
        </span>
      }
      subtitulo={`${t.endereco}${t.bairro ? ` · ${t.bairro}` : ""} · ${t.municipio}/${t.uf}`}
      selo={
        onFoco && (
          <Button variant="outline" size="xs" onClick={() => onFoco(t.id)}>
            Painel
          </Button>
        )
      }
    >
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Indicador rotulo="Área" valor={t.area_fmt} />
        <Indicador rotulo="Preço pedido" valor={t.preco_fmt} />
        <Indicador rotulo="R$/m² terreno" valor={t.preco_m2_terreno_fmt} />
        <Indicador rotulo="Situação" valor={t.situacao} />
        <Indicador rotulo="Zona" valor={t.zona ?? "não identificada"} />
        <Indicador rotulo="Testada" valor={t.testada_m === null ? "—" : `${t.testada_m} m`} />
        <Indicador rotulo="Negociação" valor={t.negociacao ?? "—"} />
        <Indicador rotulo="Matrícula" valor={t.matricula_informada ? "Informada" : "Ausente"} />
      </dl>
      {t.restricoes.length > 0 ? (
        <Avisos titulo="Restrições" itens={t.restricoes.map((r) => `${r.tipo}: ${r.descricao}`)} />
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck className="size-3.5 text-brand" aria-hidden />
          Sem restrição ambiental cadastrada que atinja o lote.
        </p>
      )}
      {t.onus && <Avisos titulo="Ônus registrado" itens={[t.onus]} />}
    </Moldura>
  )
}

function CartaoLocalizacao({ l }: { l: ResultadoLocalizacao }) {
  return (
    <Moldura
      icone={<MapPinned />}
      titulo="Localização do endereço"
      subtitulo={l.consulta}
      rodape={l.aviso ?? undefined}
    >
      <ul className="-mx-4 -my-3 divide-y">
        {l.candidatos.map((c) => (
          <li key={`${c.longitude},${c.latitude}`} className="px-4 py-2.5">
            <p className="font-medium">{c.descricao}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className={cn(!c.exato && "text-amber-700 dark:text-amber-300")}>
                {c.precisao}
              </span>
              <span>·</span>
              <span>{c.zona ? `zona ${c.zona}` : "fora das zonas cadastradas"}</span>
              <span>·</span>
              <span className="tabular-nums">
                {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </Moldura>
  )
}

// Zoneamento --------------------------------------------------------------------------

function CartaoZona({ z }: { z: ResultadoZona }) {
  return (
    <Moldura
      icone={<Landmark />}
      titulo={z.zona ? `Zona ${z.zona.codigo} · ${z.zona.nome}` : "Zona não identificada"}
      subtitulo={`${z.referencia}${z.municipio ? ` · ${z.municipio.nome}/${z.municipio.uf} (${z.municipio.cobertura.toLowerCase()})` : ""}`}
      selo={
        z.zona && (
          <Badge variant="outline" className="text-muted-foreground">
            {z.atribuicao === "manual" ? "Atribuição manual" : "Por interseção"}
          </Badge>
        )
      }
    >
      {z.zonas_cruzadas.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Zonas que o lote cruza:{" "}
          {z.zonas_cruzadas.map((c) => `${c.codigo} (${c.percentual_fmt})`).join(", ")}
        </p>
      )}
      {z.restricoes_ambientais.length > 0 ? (
        <Avisos
          titulo="Restrições ambientais"
          itens={z.restricoes_ambientais.map(
            (r) => `${r.tipo}: ${r.nome}${r.ficticia ? " (camada fictícia)" : ""}`,
          )}
        />
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck className="size-3.5 text-brand" aria-hidden />
          Nenhuma camada ambiental cadastrada atinge o local.
        </p>
      )}
      {z.mensagem && <p className="text-xs text-muted-foreground">{z.mensagem}</p>}
    </Moldura>
  )
}

function CartaoParametros({ p }: { p: ResultadoParametros }) {
  const validado = p.status === "validado"
  return (
    <Moldura
      icone={<Scale />}
      titulo={p.zona ? `Parâmetros urbanísticos · ${p.zona.codigo}` : "Parâmetros urbanísticos"}
      subtitulo={p.referencia}
      selo={
        validado ? (
          <Badge variant="outline" className="border-transparent bg-accent text-accent-foreground">
            <BadgeCheck aria-hidden /> Validado
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
          >
            <TriangleAlert aria-hidden /> Sem regra validada
          </Badge>
        )
      }
      rodape={
        validado
          ? "Valores da tabela de regras validada pelo time de analistas, com a lei e o artigo de cada campo."
          : undefined
      }
    >
      {p.mensagem && <p className="text-xs text-muted-foreground">{p.mensagem}</p>}
      {p.regras.map((r) => (
        <details key={r.uso} open={p.regras.length === 1} className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium">
            <ChevronRight
              className="size-4 transition-transform group-open:rotate-90"
              aria-hidden
            />
            {r.uso_rotulo}
            {r.uso_na_lei && (
              <span className="text-xs font-normal text-muted-foreground">({r.uso_na_lei})</span>
            )}
            {!r.permitido && (
              <Badge
                variant="outline"
                className="ml-auto border-destructive/40 bg-destructive/10 text-destructive"
              >
                Não permitido
              </Badge>
            )}
          </summary>
          {r.permitido && (
            <div className="border-t">
              <table className="w-full text-xs">
                <tbody>
                  {r.parametros.map((x) => (
                    <tr key={x.campo} className="border-b align-top last:border-b-0">
                      <th
                        scope="row"
                        className="w-2/5 px-3 py-1.5 text-left font-normal text-muted-foreground"
                      >
                        {x.rotulo}
                      </th>
                      <td className="px-3 py-1.5">
                        <span className="font-medium tabular-nums">
                          <ValorComTrecho valor={x.valor} trecho={x.trecho} />
                        </span>
                        {!fonteComum(r.parametros) && (
                          <span className="block text-muted-foreground">
                            <TextoFonte fonte={x.fonte} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fonteComum(r.parametros) && (
                <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                  Fonte: <TextoFonte fonte={fonteComum(r.parametros)} />
                </p>
              )}
              {r.nao_definidos.length > 0 && (
                <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                  Não definidos na regra: {r.nao_definidos.join(", ").toLowerCase()}.
                </p>
              )}
            </div>
          )}
        </details>
      ))}
      {p.proximos_passos.length > 0 && (
        <div className="text-xs">
          <p className="font-semibold">Próximos passos</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {p.proximos_passos.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </Moldura>
  )
}

function CartaoLegislacao({ l }: { l: ResultadoLegislacao }) {
  return (
    <Moldura
      icone={<ScrollText />}
      titulo={`Legislação · ${l.municipio}`}
      subtitulo="Texto de lei para contexto (não é parâmetro validado)"
      rodape={l.aviso}
    >
      <ul className="space-y-2">
        {l.trechos.map((t, i) => (
          <li key={i} className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="flex items-center gap-2 text-xs font-semibold">
              {t.documento}
              {t.artigo && `, ${t.artigo}`}
              {t.ficticio && <Ficticio />}
            </p>
            <p className="mt-1 line-clamp-4 text-xs text-muted-foreground">{t.texto}</p>
          </li>
        ))}
      </ul>
    </Moldura>
  )
}

// Mercado -----------------------------------------------------------------------------

function CartaoMercado({ m }: { m: ResultadoMercado }) {
  const c = m.comparaveis
  return (
    <Moldura
      icone={<TrendingUp />}
      titulo="Mercado"
      subtitulo={`${m.referencia} · ${m.tipologia}`}
      selo={
        c?.baixa_confianca && (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-300">
            Baixa confiança
          </Badge>
        )
      }
    >
      {c ? (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Indicador rotulo="Mediana" valor={c.mediana_m2_fmt} destaque />
            <Indicador rotulo="Média" valor={c.media_m2_fmt} />
            <Indicador rotulo="Amostras" valor={c.n} />
            <Indicador rotulo="Dispersão (CV)" valor={c.cv_fmt} />
          </dl>
          <p className="text-xs text-muted-foreground">
            Faixa {c.faixa_fmt}. Comparáveis num raio de {c.raio_m.toLocaleString("pt-BR")} m desde{" "}
            {c.desde_fmt}
            {c.ficticios ? " (fictícios)" : ""}.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sem comparáveis na região para esta tipologia.
        </p>
      )}
      {m.cub && (
        <dl className="grid grid-cols-2 gap-2">
          <Indicador rotulo={`CUB ${m.cub.padrao}/${m.cub.uf}`} valor={m.cub.valor_fmt} />
          <Indicador rotulo="Referência" valor={`${m.cub.mes_fmt} · ${m.cub.origem}`} />
        </dl>
      )}
      <Avisos itens={m.avisos} />
    </Moldura>
  )
}

// Viabilidade -------------------------------------------------------------------------

function CartaoViabilidade({
  v,
  onFoco,
}: {
  v: ResultadoViabilidadeCopiloto
  onFoco?: (id: string) => void
}) {
  const ordem = v.ranking.map((r) => r.uso)
  const estudos = [...v.estudos].sort((a, b) => {
    const ia = ordem.indexOf(a.uso)
    const ib = ordem.indexOf(b.uso)
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
  })
  const melhor = v.ranking.find((r) => r.elegivel)
  return (
    <Moldura
      icone={<Building2 />}
      titulo={`Estudo de viabilidade · ${v.referencia}`}
      subtitulo={
        melhor
          ? `Melhor uso: ${melhor.uso_rotulo} (TIR ajustada ao risco)`
          : "Nenhum uso elegível no cenário base"
      }
      selo={
        v.terreno_id &&
        onFoco && (
          <Button variant="outline" size="xs" onClick={() => onFoco(v.terreno_id!)}>
            Painel
          </Button>
        )
      }
      rodape={v.disclaimer}
    >
      {v.ranking.length > 1 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Uso</th>
                <th className="px-3 py-1.5 text-right font-medium">TIR</th>
                <th className="px-3 py-1.5 text-right font-medium">Margem</th>
                <th className="px-3 py-1.5 text-right font-medium">Risco</th>
              </tr>
            </thead>
            <tbody>
              {v.ranking.map((r) => (
                <tr key={r.uso} className="border-t">
                  <td className="px-3 py-1.5">
                    {r.uso_rotulo}
                    {!r.elegivel && <span className="block text-muted-foreground">{r.motivo}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.tir_anual_fmt}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.margem_fmt}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.score_risco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {estudos.map((e, i) => (
        <details key={e.uso} open={i === 0} className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium">
            <ChevronRight
              className="size-4 transition-transform group-open:rotate-90"
              aria-hidden
            />
            {e.uso_rotulo}
            <span className="ml-auto flex items-center gap-2">
              {e.base && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  margem {e.base.margem_fmt}
                </span>
              )}
              {e.risco && <SeloRisco nivel={e.risco.nivel} score={e.risco.score} />}
            </span>
          </summary>
          <div className="space-y-3 border-t px-3 py-3">
            <Estudo e={e} />
          </div>
        </details>
      ))}
    </Moldura>
  )
}

function Estudo({ e }: { e: EstudoResumo }) {
  return (
    <>
      {e.pendencias.length > 0 && <Avisos titulo="Pendências" itens={e.pendencias} />}
      {e.base && (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Indicador rotulo="VGV" valor={e.base.vgv_fmt} />
          <Indicador rotulo="Lucro" valor={e.base.lucro_fmt} />
          <Indicador rotulo="Margem líquida" valor={e.base.margem_fmt} destaque />
          <Indicador rotulo="TIR" valor={e.base.tir_anual_fmt} destaque />
          <Indicador rotulo="ROI" valor={e.base.roi_fmt} />
          <Indicador rotulo="Payback" valor={e.base.payback_fmt} />
          <Indicador rotulo="Custo total" valor={e.base.custo_total_fmt} />
          <Indicador rotulo="Exposição máx." valor={e.base.exposicao_fmt} />
        </dl>
      )}
      {e.potencial && (
        <p className="text-xs text-muted-foreground">
          Potencial: {e.potencial.area_computavel_fmt} computáveis (CA {e.potencial.ca_aplicado_fmt}
          {e.potencial.usa_outorga ? ", com outorga" : ""}), {e.potencial.pavimentos} pavimentos (
          {e.potencial.altura_fmt}), {e.potencial.area_privativa_fmt} privativos. Limitado por{" "}
          {e.potencial.limitante.toLowerCase()}.
        </p>
      )}
      {e.cenarios.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {e.cenarios.map((c) => (
            <div key={c.cenario} className="rounded-lg border px-2 py-1.5">
              <p className="font-medium">{c.cenario}</p>
              <p className="tabular-nums">margem {c.margem_fmt}</p>
              <p className="text-muted-foreground tabular-nums">TIR {c.tir_anual_fmt}</p>
            </div>
          ))}
        </div>
      )}
      {e.risco && e.risco.flags.length > 0 && (
        <div className="text-xs">
          <p className="font-semibold">Flags de risco</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {e.risco.flags.map((f) => (
              <li key={f.rotulo}>
                <span className="text-foreground">{f.rotulo}</span>: {f.detalhe}
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.premissas_principais.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {e.premissas_principais.map((p) => (
              <tr key={p.rotulo} className="border-b align-top last:border-b-0">
                <th scope="row" className="py-1 pr-2 text-left font-normal text-muted-foreground">
                  {p.rotulo}
                </th>
                <td className="py-1 pr-2 font-medium tabular-nums">{p.valor_fmt}</td>
                <td className="py-1 text-muted-foreground">{p.fonte}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Avisos itens={e.avisos} />
      {e.analysis_run_id && (
        <div className="flex justify-end">
          <AbrirRelatorio analysisRunId={e.analysis_run_id} size="xs" />
        </div>
      )}
    </>
  )
}

function CartaoComparacao({ c }: { c: ResultadoComparacao }) {
  return (
    <Moldura icone={<Scale />} titulo="Comparativo de terrenos" rodape={c.disclaimer}>
      <div className="-mx-4 -my-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-1.5 text-left font-medium">Terreno</th>
              <th className="px-2 py-1.5 text-left font-medium">Melhor uso</th>
              <th className="px-2 py-1.5 text-right font-medium">Margem</th>
              <th className="px-2 py-1.5 text-right font-medium">TIR</th>
              <th className="px-4 py-1.5 text-right font-medium">Risco</th>
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l) => (
              <tr key={l.codigo} className="border-t align-top">
                <td className="px-4 py-2">
                  <p className="font-medium">{l.codigo}</p>
                  <p className="text-muted-foreground">
                    {[l.bairro, l.area_fmt, l.preco_fmt, l.zona].filter(Boolean).join(" · ")}
                  </p>
                  {l.observacao && (
                    <p className="mt-0.5 text-amber-700 dark:text-amber-300">{l.observacao}</p>
                  )}
                </td>
                <td className="px-2 py-2">{l.melhor_uso ?? "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.margem_fmt}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.tir_anual_fmt}</td>
                <td className="px-4 py-2 text-right tabular-nums">{l.risco}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Moldura>
  )
}

function CartaoCobertura({ c }: { c: ResultadoCobertura }) {
  return (
    <Moldura
      icone={<MapPin />}
      titulo={`Pedido de cobertura · ${c.municipio}/${c.uf}`}
      selo={<Badge variant="secondary">Protocolo {c.protocolo}</Badge>}
    >
      <p className="text-sm">{c.mensagem}</p>
    </Moldura>
  )
}

function CartaoRelatorio({ r }: { r: ResultadoRelatorio }) {
  return (
    <Moldura icone={<FileText />} titulo="Relatório de viabilidade" subtitulo={r.titulo}>
      <p className="text-sm text-muted-foreground">
        Variáveis editáveis, recálculo, cenários, fluxo de caixa, versões e exportação em PDF.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={r.url}>
            <FileText aria-hidden /> Abrir relatório
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={r.pdf_url} download>
            <FileDown aria-hidden /> Baixar PDF
          </a>
        </Button>
      </div>
    </Moldura>
  )
}
