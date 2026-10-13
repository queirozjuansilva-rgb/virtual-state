import { z } from "zod"

/**
 * Validação das premissas na fronteira (servidor, ajustes do usuário no
 * relatório). Frações em 0–1. O motor assume entradas já validadas.
 */
const fracao = z.number().min(0).max(1)
const meses = (min: number) => z.number().int().min(min).max(240)

export const premissasSchema = z
  .object({
    usarCaMaximo: z.boolean(),
    eficiencia: z.number().gt(0).max(1),
    areaNaoComputavelPct: z.number().min(0).max(3),
    equivalenciaNaoComputavel: fracao,
    peDireitoM: z.number().min(2.2).max(10),
    cubM2: z.number().gt(0),
    fatorCub: z.number().min(0.5).max(5),
    precoTerreno: z.number().min(0),
    formaAquisicao: z.enum(["compra", "permuta_fisica", "permuta_financeira", "misto"]),
    permutaPct: fracao,
    itbiPct: fracao,
    registroPct: fracao,
    projetosPct: fracao,
    marketingPct: fracao,
    corretagemPct: fracao,
    administracaoPct: fracao,
    contingenciaPct: fracao,
    impostosPct: fracao,
    prazoAprovacaoMeses: meses(0),
    prazoObraMeses: meses(1),
    prazoVendasMeses: meses(1),
    vendasNoLancamentoPct: fracao,
    recebimentoSinalPct: fracao,
    recebimentoObraPct: fracao,
    recebimentoChavesPct: fracao,
    curvaObra: z.enum(["linear", "s"]),
    declividadeAcentuadaPct: z.number().min(0).max(100),
    nMinimoComparaveis: z.number().int().min(1).max(1000),
    cvMaximoComparaveis: z.number().gt(0).max(5),
    margemMinimaConservador: z.number().min(-1).max(1),
  })
  .refine(
    (p) =>
      Math.abs(p.recebimentoSinalPct + p.recebimentoObraPct + p.recebimentoChavesPct - 1) < 1e-6,
    { path: ["recebimentoChavesPct"], error: "Sinal + mensais + chaves devem somar 100%." },
  )
  .refine((p) => p.formaAquisicao === "compra" || p.permutaPct > 0, {
    path: ["permutaPct"],
    error: "Informe o percentual de permuta.",
  })
  .refine(
    (p) =>
      p.formaAquisicao === "permuta_fisica" ||
      p.formaAquisicao === "permuta_financeira" ||
      p.precoTerreno > 0,
    {
      path: ["precoTerreno"],
      error: "Informe o preço do terreno.",
    },
  )
