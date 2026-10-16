"use client"

import {
  Check,
  Copy,
  FileDown,
  History,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  SlidersHorizontal,
  TriangleAlert,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ResultadoViabilidade } from "@/lib/feasibility"
import { formatDateTime } from "@/lib/format"
import {
  CAMPOS_EDITAVEIS,
  type CampoEditavel,
  type ChaveEditavel,
  type ErrosEdicao,
} from "@/lib/relatorio/edicao"
import { cn } from "@/lib/utils"
import {
  alternarCompartilhamento,
  recalcularRelatorio,
  registrarRevisao,
  salvarVersaoRelatorio,
} from "@/server/relatorios/actions"
import type { RelatorioCompleto } from "@/server/relatorios/queries"

import { RelatorioConteudo } from "./relatorio-conteudo"
import {
  edicoesAlteradas,
  edicoesDoFormulario,
  formatarValorCampo,
  formularioDaEntrada,
  type Formulario,
} from "./variaveis"

type Rascunho = {
  resultado: ResultadoViabilidade
  alteradas: ChaveEditavel[]
  totalMs: number
  motorMs: number
}

export function RelatorioEditor({
  relatorio,
  podeRevisar,
}: {
  relatorio: RelatorioCompleto
  podeRevisar: boolean
}) {
  const router = useRouter()
  const { versao } = relatorio
  const editavel = versao.versao === relatorio.versaoAtual
  const inicial = useMemo(() => formularioDaEntrada(versao.entrada), [versao.entrada])
  const [form, setForm] = useState<Formulario>(inicial)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erros, setErros] = useState<ErrosEdicao>({})
  const [recalculando, iniciarRecalculo] = useTransition()
  const [salvando, iniciarSalvar] = useTransition()

  const { edicoes, erros: errosLocais } = useMemo(() => edicoesDoFormulario(form), [form])
  const mudancas = useMemo(
    () => edicoesAlteradas(versao.entrada, edicoes),
    [versao.entrada, edicoes],
  )
  const sujo = Object.keys(mudancas).length > 0 || Object.keys(errosLocais).length > 0
  const desatualizado =
    rascunho !== null &&
    JSON.stringify(Object.keys(mudancas).sort()) !== JSON.stringify([...rascunho.alteradas].sort())

  function mudar(chave: ChaveEditavel, valor: string | boolean) {
    setForm((f) => ({ ...f, [chave]: valor }))
  }

  function recalcular() {
    if (Object.keys(errosLocais).length > 0) {
      setErros(errosLocais)
      return
    }
    iniciarRecalculo(async () => {
      const inicio = performance.now()
      const r = await recalcularRelatorio({
        relatorioId: relatorio.id,
        versao: versao.versao,
        edicoes: mudancas,
      })
      if (!r.ok) {
        setErros(r.erros)
        return
      }
      setErros({})
      setRascunho({
        resultado: r.resultado,
        alteradas: r.alteradas,
        totalMs: performance.now() - inicio,
        motorMs: r.tempoMotorMs,
      })
    })
  }

  function descartar() {
    setForm(inicial)
    setRascunho(null)
    setErros({})
  }

  function salvar() {
    if (Object.keys(errosLocais).length > 0) {
      setErros(errosLocais)
      return
    }
    iniciarSalvar(async () => {
      const r = await salvarVersaoRelatorio({
        relatorioId: relatorio.id,
        versao: versao.versao,
        edicoes: mudancas,
      })
      if (!r.ok) {
        setErros(r.erros)
        if (r.erros.geral) toast.error(r.erros.geral)
        return
      }
      toast.success(`Versão ${r.versao} salva.`)
      router.replace(`/relatorios/${relatorio.id}`)
    })
  }

  const exibido = rascunho?.resultado ?? versao.resultado
  const principais = CAMPOS_EDITAVEIS.filter((c) => c.grupo === "principal")
  const avancados = CAMPOS_EDITAVEIS.filter((c) => c.grupo === "avancado")
  const fontes = new Map(exibido.premissas.map((p) => [p.chave, p.fonte]))

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{relatorio.titulo}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{relatorio.organizacao}</span>
            <span aria-hidden>·</span>
            <span>
              Versão {versao.versao} de {relatorio.versaoAtual}, salva em{" "}
              {formatDateTime(versao.salvaEm)}
            </span>
            <span aria-hidden>·</span>
            <span>Motor de viabilidade v{versao.versaoMotor}</span>
            {relatorio.terreno?.ficticio && <Badge variant="outline">Dados fictícios</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/relatorios/${relatorio.id}/pdf?versao=${versao.versao}`} download>
              <FileDown aria-hidden /> Exportar PDF
            </a>
          </Button>
          <Compartilhar relatorioId={relatorio.id} token={relatorio.tokenCompartilhamento} />
        </div>
      </header>

      {relatorio.desatualizado && (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            <span className="font-medium">Relatório desatualizado.</span>{" "}
            {relatorio.desatualizado.motivo ??
              "A regra urbanística usada mudou depois deste estudo."}{" "}
            Refaça o estudo para usar a regra vigente; os PDFs já exportados não mudam.
          </span>
        </p>
      )}

      {!editavel && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Você está vendo a versão {versao.versao}, somente leitura.
          <Link
            href={`/relatorios/${relatorio.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Ir para a versão atual ({relatorio.versaoAtual})
          </Link>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 min-w-0 lg:order-1">
          {desatualizado && (
            <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
              Os números abaixo são do último recálculo; você mudou variáveis depois. Recalcule para
              atualizar.
            </p>
          )}
          <RelatorioConteudo
            entrada={versao.entrada}
            resultado={exibido}
            contexto={relatorio.contexto}
            terreno={relatorio.terreno}
            alteradas={rascunho?.alteradas}
          />
        </div>

        <aside className="order-1 space-y-6 lg:order-2">
          <section className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <SlidersHorizontal className="size-4 text-brand" aria-hidden /> Variáveis
              </h2>
              {editavel && (
                <Button size="sm" onClick={recalcular} disabled={recalculando || !sujo}>
                  {recalculando ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                  Recalcular
                </Button>
              )}
            </div>
            {rascunho && (
              <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                Recalculado em {Math.round(rascunho.totalMs)} ms (motor:{" "}
                {rascunho.motorMs.toFixed(1)} ms).
              </p>
            )}
            {erros.geral && (
              <p role="alert" className="text-sm text-destructive">
                {erros.geral}
              </p>
            )}
            <div className="grid gap-3">
              {principais.map((c) => (
                <CampoVariavel
                  key={c.chave}
                  campo={c}
                  valor={form[c.chave]}
                  erro={erros[c.chave]}
                  fonte={fontes.get(c.chave)}
                  desabilitado={!editavel}
                  alterado={c.chave in mudancas}
                  onChange={(v) => mudar(c.chave, v)}
                />
              ))}
            </div>
            <details className="group rounded-lg border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                Avançado ({avancados.length})
              </summary>
              <div className="grid gap-3 border-t p-3">
                {avancados.map((c) => (
                  <CampoVariavel
                    key={c.chave}
                    campo={c}
                    valor={form[c.chave]}
                    erro={erros[c.chave]}
                    fonte={fontes.get(c.chave)}
                    desabilitado={!editavel}
                    alterado={c.chave in mudancas}
                    onChange={(v) => mudar(c.chave, v)}
                  />
                ))}
              </div>
            </details>
          </section>

          <Versoes relatorio={relatorio} />
          <Revisoes relatorio={relatorio} podeRevisar={podeRevisar} />
        </aside>
      </div>

      {editavel && (sujo || rascunho) && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm font-medium">Documento em rascunho. Alterações não salvas.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={descartar} disabled={salvando}>
              <Undo2 aria-hidden /> Descartar
            </Button>
            <Button onClick={salvar} disabled={salvando || Object.keys(mudancas).length === 0}>
              {salvando ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Salvar alterações
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CampoVariavel({
  campo,
  valor,
  erro,
  fonte,
  desabilitado,
  alterado,
  onChange,
}: {
  campo: CampoEditavel
  valor: string | boolean
  erro?: string
  fonte?: ResultadoViabilidade["premissas"][number]["fonte"]
  desabilitado: boolean
  alterado: boolean
  onChange: (valor: string | boolean) => void
}) {
  const id = `var-${campo.chave}`
  const sufixo = {
    moeda: "R$",
    moeda_m2: "R$/m²",
    percentual: "%",
    meses: "meses",
    numero: "",
    booleano: "",
    opcao: "",
  }[campo.tipo]
  const origem =
    fonte?.tipo === "premissa_usuario"
      ? "Premissa do usuário"
      : fonte?.tipo === "cub"
        ? `CUB ${fonte.padrao}/${fonte.uf} (${fonte.mesReferencia})`
        : fonte?.tipo === "comparaveis"
          ? `Mediana de ${fonte.n} comparáveis`
          : fonte?.tipo === "dado_terreno"
            ? "Cadastro do terreno"
            : "Default da plataforma"

  let controle: ReactNode
  if (campo.tipo === "booleano") {
    controle = (
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <Checkbox
          id={id}
          checked={valor === true}
          disabled={desabilitado}
          onCheckedChange={(v) => onChange(v === true)}
        />
        {campo.rotulo}
      </label>
    )
  } else if (campo.tipo === "opcao") {
    controle = (
      <Select value={String(valor)} onValueChange={onChange} disabled={desabilitado}>
        <SelectTrigger id={id} className="w-full" aria-invalid={erro ? true : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {campo.opcoes!.map(([v, rotulo]) => (
            <SelectItem key={v} value={v}>
              {rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else {
    controle = (
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={String(valor)}
          disabled={desabilitado}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          className={cn(sufixo && "pr-14", "tabular-nums")}
        />
        {sufixo && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {sufixo}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-1">
      {campo.tipo !== "booleano" && (
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
          {campo.rotulo}
          {alterado && <span className="size-1.5 rounded-full bg-brand" aria-label="alterado" />}
        </label>
      )}
      {controle}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {alterado ? "Premissa do usuário (não salva)" : origem}
        </p>
      )}
    </div>
  )
}

function Versoes({ relatorio }: { relatorio: RelatorioCompleto }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <History className="size-4 text-brand" aria-hidden /> Versões
      </h2>
      <ol className="space-y-3">
        {[...relatorio.versoes].reverse().map((v) => {
          const atual = v.versao === relatorio.versao.versao
          return (
            <li key={v.versao} className="text-sm">
              <Link
                href={
                  v.versao === relatorio.versaoAtual
                    ? `/relatorios/${relatorio.id}`
                    : `?versao=${v.versao}`
                }
                className={cn("font-medium hover:underline", atual && "text-primary")}
                aria-current={atual ? "page" : undefined}
              >
                Versão {v.versao}
              </Link>
              <span className="text-xs text-muted-foreground">
                {" "}
                · {formatDateTime(v.salvaEm)} · motor v{v.versaoMotor}
              </span>
              {v.versao === 1 ? (
                <p className="text-xs text-muted-foreground">Estudo original.</p>
              ) : v.alteracoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem mudança nas variáveis.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {v.alteracoes.map((a) => {
                    const campo = CAMPOS_EDITAVEIS.find((c) => c.chave === a.chave)!
                    return (
                      <li key={a.chave}>
                        {a.rotulo}: {formatarValorCampo(campo, a.de)} →{" "}
                        {formatarValorCampo(campo, a.para)}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Revisoes({
  relatorio,
  podeRevisar,
}: {
  relatorio: RelatorioCompleto
  podeRevisar: boolean
}) {
  const router = useRouter()
  const [veredito, setVeredito] = useState<"conferido" | "divergente">("conferido")
  const [comentario, setComentario] = useState("")
  const [pendente, iniciar] = useTransition()

  function enviar() {
    iniciar(async () => {
      const r = await registrarRevisao({
        relatorioId: relatorio.id,
        versaoId: relatorio.versao.id,
        veredito,
        comentario: comentario.trim() || undefined,
      })
      if (!r.ok) {
        toast.error(r.erro)
        return
      }
      toast.success("Revisão registrada.")
      setComentario("")
      router.refresh()
    })
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Check className="size-4 text-brand" aria-hidden /> Revisão de analista
      </h2>
      {relatorio.revisoes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma revisão ainda.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {relatorio.revisoes.map((r) => (
            <li key={r.id}>
              <Badge
                variant="outline"
                className={
                  r.veredito === "conferido"
                    ? "border-transparent bg-accent text-accent-foreground"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                }
              >
                {r.veredito === "conferido" ? "Conferido" : "Divergente"}
              </Badge>{" "}
              <span className="text-xs text-muted-foreground">
                versão {r.versao ?? "—"} · {r.revisor} · {formatDateTime(r.criadaEm)}
              </span>
              {r.comentario && <p className="mt-1 text-sm">{r.comentario}</p>}
            </li>
          ))}
        </ul>
      )}
      {podeRevisar && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Sua revisão vale para a versão {relatorio.versao.versao}.
          </p>
          <div className="flex gap-2" role="radiogroup" aria-label="Veredito">
            {(["conferido", "divergente"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={veredito === v ? "default" : "outline"}
                role="radio"
                aria-checked={veredito === v}
                onClick={() => setVeredito(v)}
              >
                {v === "conferido" ? "Conferido" : "Divergente"}
              </Button>
            ))}
          </div>
          <label htmlFor="comentario-revisao" className="sr-only">
            Comentário
          </label>
          <Textarea
            id="comentario-revisao"
            rows={3}
            placeholder={
              veredito === "divergente"
                ? "Explique a divergência (obrigatório)."
                : "Comentário (opcional)."
            }
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
          <Button
            size="sm"
            onClick={enviar}
            disabled={pendente || (veredito === "divergente" && !comentario.trim())}
          >
            {pendente && <Loader2 className="animate-spin" aria-hidden />}
            Registrar revisão
          </Button>
        </div>
      )}
    </section>
  )
}

function Compartilhar({ relatorioId, token }: { relatorioId: string; token: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [pendente, iniciar] = useTransition()
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/r/${token}` : null

  function alternar(ativo: boolean) {
    iniciar(async () => {
      const r = await alternarCompartilhamento(relatorioId, ativo)
      if (!r.ok) toast.error(r.erro)
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Link2 aria-hidden /> Compartilhar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link somente leitura</DialogTitle>
            <DialogDescription>
              Quem tiver o link vê a última versão salva, sem precisar de conta e sem poder editar.
              Gerar de novo invalida o link anterior.
            </DialogDescription>
          </DialogHeader>
          {url ? (
            <div className="flex gap-2">
              <Input
                readOnly
                value={url}
                aria-label="Link do relatório"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copiar link"
                onClick={() => {
                  void navigator.clipboard.writeText(url)
                  toast.success("Link copiado.")
                }}
              >
                <Copy aria-hidden />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">O compartilhamento está desligado.</p>
          )}
          <DialogFooter>
            {url ? (
              <>
                <Button variant="outline" onClick={() => alternar(false)} disabled={pendente}>
                  Desligar link
                </Button>
                <Button onClick={() => alternar(true)} disabled={pendente}>
                  Gerar novo link
                </Button>
              </>
            ) : (
              <Button onClick={() => alternar(true)} disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" aria-hidden />}
                Gerar link
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
