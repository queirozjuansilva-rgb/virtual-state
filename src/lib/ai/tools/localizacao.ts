import { z } from "zod"

import type { ResultadoLocalizacao } from "../tipos"
import { ErroFerramenta, ferramenta } from "./ferramenta"

/** Precisão do resultado conforme o tipo de lugar da MapTiler. */
const PRECISAO: Record<string, string> = {
  address: "endereço exato",
  poi: "ponto de interesse",
  road: "rua (sem número)",
  street: "rua (sem número)",
  postal_code: "CEP",
  neighbourhood: "bairro",
  municipal_district: "bairro",
  locality: "localidade",
  place: "cidade",
  municipality: "cidade",
}

export const localizarEndereco = ferramenta({
  nome: "localizar_endereco",
  rotulo: "Localizando o endereço",
  descricao:
    "Converte um endereço digitado pelo usuário em coordenadas (geocodificação, só no Brasil) e informa, para cada candidato, a precisão e a zona cadastrada que contém o ponto. Use quando o usuário citar um endereço e não houver ponto selecionado no mapa; depois use a longitude/latitude do candidato em identificar_zona, consultar_parametros_urbanisticos, consultar_mercado ou estudar_ponto. Inclua número, bairro, cidade e UF quando o usuário tiver informado.",
  entrada: z.object({
    endereco: z
      .string()
      .trim()
      .min(3)
      .max(200)
      .describe("Endereço como o usuário escreveu, com cidade e UF se ele mencionou."),
  }),
  async executar({ endereco }, { dados }) {
    const candidatos = await dados.geocodificar(endereco)
    if (candidatos === null) {
      throw new ErroFerramenta(
        "A busca de endereços não está configurada neste ambiente. Peça ao usuário para marcar o ponto no mapa (ícone de alfinete no campo de mensagem).",
      )
    }

    const lista: ResultadoLocalizacao["candidatos"] = await Promise.all(
      candidatos.map(async (c) => {
        const ponto = await dados.analisarPonto(c.longitude, c.latitude)
        const exato = c.tipo === "address" && c.numero !== null
        return {
          descricao: c.descricao,
          precisao: exato
            ? "endereço exato"
            : c.tipo === "address"
              ? "rua (sem número)"
              : (PRECISAO[c.tipo] ?? "aproximada"),
          exato,
          longitude: Number(c.longitude.toFixed(6)),
          latitude: Number(c.latitude.toFixed(6)),
          zona: ponto.zona?.code ?? null,
          municipio: ponto.municipio ? `${ponto.municipio.name}/${ponto.municipio.uf}` : null,
        }
      }),
    )

    const resultado: ResultadoLocalizacao = {
      consulta: endereco,
      candidatos: lista,
      aviso:
        lista.length === 0
          ? "Endereço não encontrado. Peça mais detalhes (número, bairro, cidade) ou que o usuário marque o ponto no mapa."
          : !lista[0].exato || lista.filter((c) => c.exato).length > 1
            ? "Localização ambígua ou aproximada: confirme com o usuário qual é o terreno antes de estudar."
            : "Geocodificação é aproximada (posição do número na rua); para o lote exato, o ideal é desenhar o polígono.",
    }
    return {
      resultado,
      cartao: lista.length > 0 ? { tipo: "localizacao", dados: resultado } : undefined,
    }
  },
})
