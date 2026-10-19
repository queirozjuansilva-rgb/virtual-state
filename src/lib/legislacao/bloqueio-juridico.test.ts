import { describe, expect, it } from "vitest"

import { ressalvaDeVigencia } from "./bloqueio-juridico"

const TITULO = "Vigência da LC nº 450/2025 e efeitos da LC nº 461/2026"
const FINAL =
  "A aplicação dessas normas depende de parecer jurídico ainda não emitido; " +
  "não as trate como vigentes nem como revogadas."

describe("ressalva de vigência do copiloto", () => {
  it("sem pendência aberta, não há ressalva", () => {
    expect(ressalvaDeVigencia([])).toBeNull()
  })

  it("nomeia as normas afetadas, separadas do título da pendência", () => {
    expect(
      ressalvaDeVigencia([
        {
          titulo: TITULO,
          normas: ["Lei complementar nº 62/2009", "Lei complementar nº 236/2017"],
        },
      ]),
    ).toBe(
      `Vigência sob análise jurídica (${TITULO}). Normas afetadas: Lei complementar nº 62/2009, ` +
        `Lei complementar nº 236/2017 e as normas relacionadas a elas. ${FINAL}`,
    )
  })

  it("com uma norma só, e sem norma cadastrada", () => {
    expect(ressalvaDeVigencia([{ titulo: "A", normas: ["Lei nº 1/2020"] }])).toBe(
      `Vigência sob análise jurídica (A). Normas afetadas: Lei nº 1/2020 e as normas relacionadas a elas. ${FINAL}`,
    )
    expect(ressalvaDeVigencia([{ titulo: "B", normas: [] }])).toBe(
      `Vigência sob análise jurídica (B). Normas afetadas: as ligadas a esta pendência. ${FINAL}`,
    )
  })

  it("várias pendências viram frases em sequência", () => {
    const texto = ressalvaDeVigencia([
      { titulo: "A", normas: ["Lei nº 1/2020"] },
      { titulo: "B", normas: ["Lei nº 2/2021"] },
    ])
    expect(texto?.match(/Vigência sob análise jurídica/g)).toHaveLength(2)
  })
})
