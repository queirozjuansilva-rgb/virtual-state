import "server-only"

import { Document, G, Line, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer"
import type { ReactNode } from "react"

import { formatBRL } from "@/lib/format"
import { geometriaFluxo } from "@/lib/relatorio/grafico"
import type { ModeloPdf, Par } from "@/lib/relatorio/pdf-modelo"

/** PDF do relatório (ADR 0010): @react-pdf/renderer, sem navegador headless. */

const COR = {
  marca: "#0d968b",
  texto: "#111827",
  suave: "#6b7280",
  borda: "#e5e7eb",
  fundo: "#f6f8f8",
  alerta: "#b45309",
  erro: "#b91c1c",
}

const s = StyleSheet.create({
  pagina: {
    paddingTop: 72,
    paddingBottom: 64,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COR.texto,
    // Sem lineHeight aqui: herdado da página, ele some com textos de render (nº da página).
  },
  cabecalho: {
    position: "absolute",
    top: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: COR.marca,
    paddingBottom: 6,
  },
  marca: { fontFamily: "Helvetica-Bold", fontSize: 13, color: COR.marca },
  cabecalhoInfo: { fontSize: 7.5, color: COR.suave, textAlign: "right" },
  rodapeLinha: {
    position: "absolute",
    bottom: 40,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: COR.borda,
  },
  rodapeTexto: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 110,
    fontSize: 7,
    color: COR.suave,
  },
  rodapePagina: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    fontSize: 7,
    color: COR.suave,
    textAlign: "right",
  },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 16, lineHeight: 1.2, marginBottom: 4 },
  subtitulo: { fontSize: 9, color: COR.suave, marginBottom: 12 },
  secao: { marginBottom: 14 },
  secaoTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: COR.marca,
    marginBottom: 6,
  },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kpi: { width: "24%", backgroundColor: COR.fundo, borderRadius: 4, padding: 6 },
  kpiRotulo: { fontSize: 7, color: COR.suave, textTransform: "uppercase" },
  kpiValor: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 2 },
  linha: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: COR.borda,
    paddingVertical: 3,
  },
  linhaCabecalho: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COR.texto,
    paddingBottom: 3,
    fontFamily: "Helvetica-Bold",
  },
  nota: { fontSize: 7.5, color: COR.suave, marginTop: 4 },
  alerta: { color: COR.alerta },
  item: { flexDirection: "row", gap: 4, marginBottom: 2 },
})

function Secao({
  titulo,
  children,
  inteira = false,
}: {
  titulo: string
  children: ReactNode
  /** Seção curta: não quebra entre páginas (o título nunca fica sozinho). */
  inteira?: boolean
}) {
  return (
    <View style={s.secao} wrap={!inteira}>
      <Text style={s.secaoTitulo}>{titulo}</Text>
      {children}
    </View>
  )
}

type Coluna = {
  titulo: string
  flex: number
  direita?: boolean
  suave?: boolean
  negrito?: boolean
}

/**
 * Seção com tabela: título, cabeçalho e primeira linha ficam num bloco
 * indivisível (o título nunca sobra sozinho no fim da página); o resto quebra
 * linha a linha.
 */
function SecaoTabela({
  titulo,
  colunas,
  linhas,
  depois,
}: {
  titulo: string
  colunas: Coluna[]
  linhas: string[][]
  depois?: ReactNode
}) {
  const estilo = (c: Coluna) => ({
    flex: c.flex,
    ...(c.direita ? { textAlign: "right" as const, paddingRight: 8 } : {}),
    ...(c.suave ? { color: COR.suave } : {}),
    ...(c.negrito ? { fontFamily: "Helvetica-Bold" } : {}),
  })
  const linha = (valores: string[], i: number) => (
    <View key={`${i}-${valores[0]}`} style={s.linha} wrap={false}>
      {valores.map((v, j) => (
        <Text key={j} style={estilo(colunas[j])}>
          {v}
        </Text>
      ))}
    </View>
  )
  return (
    <View style={s.secao}>
      <View wrap={false}>
        <Text style={s.secaoTitulo}>{titulo}</Text>
        <View style={s.linhaCabecalho}>
          {colunas.map((c) => (
            <Text
              key={c.titulo}
              style={{ ...estilo(c), color: COR.texto, fontFamily: "Helvetica-Bold" }}
            >
              {c.titulo}
            </Text>
          ))}
        </View>
        {linhas[0] && linha(linhas[0], 0)}
      </View>
      {linhas.slice(1).map((l, i) => linha(l, i + 1))}
      {depois}
    </View>
  )
}

function Indicadores({ pares }: { pares: Par[] }) {
  return (
    <View style={s.grade}>
      {pares.map((p) => (
        <View key={p.rotulo} style={s.kpi} wrap={false}>
          <Text style={s.kpiRotulo}>{p.rotulo}</Text>
          <Text style={s.kpiValor}>{p.valor}</Text>
        </View>
      ))}
    </View>
  )
}

function Lista({ itens, cor }: { itens: string[]; cor?: string }) {
  return (
    <View>
      {itens.map((t) => (
        <View key={t} style={s.item} wrap={false}>
          <Text style={cor ? { color: cor } : undefined}>•</Text>
          <Text style={[{ flex: 1 }, cor ? { color: cor } : {}]}>{t}</Text>
        </View>
      ))}
    </View>
  )
}

function Grafico({ modelo }: { modelo: ModeloPdf }) {
  const largura = 515
  const altura = 170
  const g = geometriaFluxo(modelo.fluxo, largura, altura, {
    topo: 8,
    direita: 8,
    base: 18,
    esquerda: 58,
  })
  if (g.pontos.length === 0) return null
  return (
    <View wrap={false}>
      <Svg width={largura} height={altura}>
        {g.ticksY.map((t) => (
          <G key={t.valor}>
            <Line
              x1={g.margens.esquerda}
              x2={largura - g.margens.direita}
              y1={t.y}
              y2={t.y}
              stroke={COR.borda}
              strokeWidth={0.5}
            />
            <Text
              x={g.margens.esquerda - 4}
              y={t.y + 2.5}
              style={{ fontSize: 6.5 }}
              fill={COR.suave}
              textAnchor="end"
            >
              {formatBRL(t.valor, { compact: true })}
            </Text>
          </G>
        ))}
        {g.ticksX.map((t) => (
          <Text
            key={t.mes}
            x={t.x}
            y={altura - 4}
            style={{ fontSize: 6.5 }}
            fill={COR.suave}
            textAnchor="middle"
          >
            {t.rotulo}
          </Text>
        ))}
        <Line
          x1={g.margens.esquerda}
          x2={largura - g.margens.direita}
          y1={g.zeroY}
          y2={g.zeroY}
          stroke={COR.suave}
          strokeWidth={0.8}
        />
        <Path d={g.area} fill={COR.marca} fillOpacity={0.12} />
        <Path d={g.caminho} stroke={COR.marca} strokeWidth={1.6} fill="none" />
        {g.payback && (
          <Line
            x1={g.payback.x}
            x2={g.payback.x}
            y1={g.margens.topo}
            y2={altura - g.margens.base}
            stroke={COR.marca}
            strokeWidth={0.6}
            strokeDasharray="3,3"
          />
        )}
      </Svg>
      <Text style={s.nota}>
        Fluxo de caixa acumulado, cenário base.
        {g.minimo
          ? ` Exposição máxima de ${formatBRL(-g.minimo.acumulado)} no mês ${g.minimo.mes}.`
          : ""}
        {g.payback ? ` Payback no mês ${g.payback.mes} (linha tracejada).` : ""}
      </Text>
    </View>
  )
}

export function RelatorioPdf({ modelo }: { modelo: ModeloPdf }) {
  return (
    <Document
      title={`${modelo.titulo} (versão ${modelo.versao})`}
      author={`virtual.estate · ${modelo.organizacao}`}
      subject="Estudo preliminar de viabilidade"
      language="pt-BR"
    >
      <Page size="A4" style={s.pagina}>
        <View style={s.cabecalho} fixed>
          <View>
            <Text style={s.marca}>virtual.estate</Text>
            <Text style={{ fontSize: 7.5, color: COR.suave }}>{modelo.organizacao}</Text>
          </View>
          <Text style={s.cabecalhoInfo}>
            Versão {modelo.versao} (salva em {modelo.salvaEm}) · motor de viabilidade v
            {modelo.versaoMotor}
            {"\n"}Gerado em {modelo.geradoEm}
          </Text>
        </View>

        <View style={s.rodapeLinha} fixed />
        <Text style={s.rodapeTexto} fixed>
          {modelo.disclaimer}
        </Text>
        <Text
          style={s.rodapePagina}
          fixed
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
        />

        <Text style={s.titulo}>{modelo.titulo}</Text>
        <Text style={s.subtitulo}>
          {modelo.local}
          {modelo.ficticio ? " · dados fictícios (teste)" : ""}
        </Text>

        <Secao titulo="Resumo" inteira>
          {modelo.pendencias.length > 0 && <Lista itens={modelo.pendencias} cor={COR.erro} />}
          {modelo.resumo.length > 0 && <Indicadores pares={modelo.resumo} />}
          <Text style={[s.nota, { marginTop: 6 }]}>
            Risco {modelo.risco.nivel.toLowerCase()} (score {modelo.risco.score} de 100). Margem
            líquida = lucro ÷ VGV; ROI = lucro ÷ exposição máxima de caixa; TIR anualizada do fluxo
            mensal.
          </Text>
        </Secao>

        <Secao titulo="Situação do lote" inteira>
          <Indicadores pares={modelo.situacao} />
        </Secao>

        {modelo.cenarios.length > 0 && (
          <SecaoTabela
            titulo="Cenários"
            colunas={[
              { titulo: "Indicador", flex: 2 },
              { titulo: "Conservador", flex: 1, direita: true },
              { titulo: "Base", flex: 1, direita: true, negrito: true },
              { titulo: "Otimista", flex: 1, direita: true },
            ]}
            linhas={modelo.cenarios.map((l) => [l.indicador, l.conservador, l.base, l.otimista])}
            depois={<Text style={s.nota}>{modelo.notaCenarios}</Text>}
          />
        )}

        {modelo.fluxo.length > 0 && (
          <Secao titulo="Fluxo de caixa" inteira>
            <Grafico modelo={modelo} />
          </Secao>
        )}

        {modelo.potencial.length > 0 && (
          <Secao titulo="Potencial construtivo" inteira>
            <Indicadores pares={modelo.potencial} />
          </Secao>
        )}

        {modelo.urbanistico.validado ? (
          <SecaoTabela
            titulo="Situação urbanística"
            colunas={[
              { titulo: "Parâmetro (validado)", flex: 2 },
              { titulo: "Valor", flex: 2 },
              { titulo: "Fonte", flex: 3, suave: true },
            ]}
            linhas={modelo.urbanistico.parametros.map((p) => [
              p.rotulo,
              p.valor,
              p.fonte ?? "sem fonte vinculada",
            ])}
            depois={
              modelo.urbanistico.restricoes.length > 0 && (
                <View style={{ marginTop: 6 }}>
                  <Lista itens={modelo.urbanistico.restricoes} cor={COR.alerta} />
                </View>
              )
            }
          />
        ) : (
          <Secao titulo="Situação urbanística">
            <Text style={s.alerta}>Não há regra urbanística validada para este uso na zona.</Text>
            {modelo.urbanistico.restricoes.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <Lista itens={modelo.urbanistico.restricoes} cor={COR.alerta} />
              </View>
            )}
          </Secao>
        )}

        <Secao titulo={`Risco: ${modelo.risco.nivel} (score ${modelo.risco.score} de 100)`}>
          {modelo.risco.flags.length === 0 ? (
            <Text style={{ color: COR.suave }}>Nenhuma flag disparou.</Text>
          ) : (
            <Lista
              itens={modelo.risco.flags.map((f) => `${f.rotulo} (+${f.peso}): ${f.detalhe}`)}
            />
          )}
        </Secao>

        <SecaoTabela
          titulo="Premissas e fontes"
          colunas={[
            { titulo: "Premissa", flex: 3 },
            { titulo: "Valor", flex: 2, direita: true },
            { titulo: "Fonte", flex: 4, suave: true },
          ]}
          linhas={modelo.premissas.map((p) => [p.rotulo, p.valor, p.fonte])}
        />

        {modelo.avisos.length > 0 && (
          <Secao titulo="Avisos">
            <Lista itens={modelo.avisos} />
          </Secao>
        )}
      </Page>
    </Document>
  )
}
