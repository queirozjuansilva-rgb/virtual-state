import { z } from "zod"

import type { ResultadoCobertura } from "../tipos"
import { ferramenta, normalizarTexto } from "./ferramenta"

export const solicitarCobertura = ferramenta({
  nome: "solicitar_cobertura",
  rotulo: "Registrando o pedido de cobertura",
  descricao:
    "Registra um pedido para a plataforma cobrir um município que ainda não tem dados (zoneamento, regras, mercado). Gera um protocolo para o time da virtual.estate. Só chame depois que o usuário confirmar que quer registrar o pedido.",
  entrada: z.object({
    municipio: z.string().trim().min(2).max(80).describe("Nome do município."),
    uf: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "UF com duas letras")
      .transform((uf) => uf.toUpperCase())
      .describe("Sigla da UF, ex.: CE."),
    endereco: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Endereço ou referência do terreno, se houver."),
  }),
  async executar(e, { dados }) {
    const existente = (await dados.municipios()).find(
      (m) => normalizarTexto(m.name) === normalizarTexto(e.municipio) && m.uf === e.uf,
    )
    if (existente?.coverage_status === "coberto") {
      return {
        resultado: {
          protocolo: null,
          mensagem: `${existente.name}/${existente.uf} já está coberto pela plataforma; não foi registrado pedido.`,
        },
      }
    }
    const id = await dados.solicitarCobertura({
      municipio: e.municipio,
      uf: e.uf,
      endereco: e.endereco ?? null,
    })
    const resultado: ResultadoCobertura = {
      protocolo: id.slice(0, 8).toUpperCase(),
      municipio: e.municipio,
      uf: e.uf,
      mensagem: `Pedido registrado. O time da virtual.estate avalia a inclusão de ${e.municipio}/${e.uf} e retorna pelo e-mail da conta.`,
    }
    return { resultado, cartao: { tipo: "cobertura", dados: resultado } }
  },
})
