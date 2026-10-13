import { z } from "zod"

import type { ResultadoRelatorio } from "../tipos"
import { ErroFerramenta, ferramenta } from "./ferramenta"

export const gerarRelatorio = ferramenta({
  nome: "gerar_relatorio",
  rotulo: "Gerando o relatório",
  descricao:
    "Cria (ou reabre, se já existir) o relatório interativo de um estudo de viabilidade: página com variáveis editáveis, recálculo, cenários, gráfico de fluxo de caixa, versões, PDF e link compartilhável. Use o analysis_run_id do estudo (cada estudo por uso devolvido por calcular_viabilidade ou estudar_ponto tem o seu). Se ainda não houver estudo do terreno e uso pedidos, rode o estudo antes.",
  entrada: z.object({
    analysis_run_id: z
      .uuid()
      .describe(
        "analysis_run_id do estudo (campo dos estudos em calcular_viabilidade/estudar_ponto).",
      ),
  }),
  async executar({ analysis_run_id }, { dados }) {
    const relatorio = await dados.criarRelatorio(analysis_run_id)
    if (!relatorio) {
      throw new ErroFerramenta(
        "Estudo não encontrado para este analysis_run_id. Rode calcular_viabilidade (ou estudar_ponto) e use o analysis_run_id do uso escolhido.",
      )
    }
    const resultado: ResultadoRelatorio = {
      relatorio_id: relatorio.id,
      titulo: relatorio.titulo,
      url: `/relatorios/${relatorio.id}`,
      pdf_url: `/relatorios/${relatorio.id}/pdf`,
    }
    return { resultado, cartao: { tipo: "relatorio", dados: resultado } }
  },
})
