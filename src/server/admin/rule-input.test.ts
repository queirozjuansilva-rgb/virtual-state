import { describe, expect, it } from "vitest"

import { parseRuleForm } from "./rule-input"

const DOC = "7b1e7a7e-1d2b-4c3a-9f10-2a6b3c4d5e6f"

const base = {
  use_type: "residencial_vertical",
  permitted: "on",
  ca_basico: "2",
  ca_max: "3",
  to_max: "60",
  recuo_lateral: "max(H/10,3)",
}

describe("parseRuleForm", () => {
  it("converte percentuais e normaliza fórmulas (rascunho sem fontes)", () => {
    const result = parseRuleForm(base)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.validate).toBe(false)
    expect(result.data.values.to_max).toBe(0.6)
    expect(result.data.values.ca_basico).toBe(2)
    expect(result.data.values.recuo_lateral).toBe("max(H / 10, 3)")
    expect(result.data.values.recuo_frontal).toBeNull()
    expect(result.data.values.permitted).toBe(true)
  })

  it("rejeita fórmula inválida com a mensagem do parser", () => {
    const result = parseRuleForm({ ...base, recuo_frontal: "max(H/10" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.recuo_frontal?.[0]).toContain("Falta fechar o parêntese")
  })

  it("exige fonte de todo parâmetro preenchido ao validar", () => {
    const result = parseRuleForm({
      ...base,
      intent: "validar",
      src_ca_basico_doc: DOC,
      src_ca_basico_article: "Art. 10",
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.src_ca_basico).toBeUndefined()
    for (const key of ["permitted", "ca_max", "to_max", "recuo_lateral"]) {
      expect(result.fieldErrors[`src_${key}`]?.[0]).toContain("cite a lei e o artigo")
    }
    // Campos vazios não exigem fonte.
    expect(result.fieldErrors.src_recuo_frontal).toBeUndefined()
  })

  it("valida quando todos os parâmetros têm fonte", () => {
    const sources = Object.fromEntries(
      ["permitted", "ca_basico", "ca_max", "to_max", "recuo_lateral"].flatMap((k) => [
        [`src_${k}_doc`, DOC],
        [`src_${k}_article`, `Art. ${k}`],
      ]),
    )
    const result = parseRuleForm({
      ...base,
      ...sources,
      intent: "validar",
      validation_note: "Conferido por Fulano com a LC 62/2009.",
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.validate).toBe(true)
    expect(result.data.sources).toHaveLength(5)
    expect(result.data.sources[0]).toMatchObject({ legal_document_id: DOC, excerpt: null })
  })

  it("exige nota de homologação ao validar e lê página, condição e resolução", () => {
    const fontes = Object.fromEntries(
      ["permitted", "ca_basico", "ca_max", "to_max", "recuo_lateral"].flatMap((k) => [
        [`src_${k}_doc`, DOC],
        [`src_${k}_article`, `Art. ${k}`],
      ]),
    )
    const sem = parseRuleForm({ ...base, ...fontes, intent: "validar" })
    expect(sem.ok).toBe(false)
    if (sem.ok) return
    expect(sem.fieldErrors.validation_note).toEqual(["Registre quem conferiu e com base em quê."])

    const com = parseRuleForm({
      ...base,
      ...fontes,
      src_ca_basico_page: "77",
      src_ca_basico_condition: "Lotes acima de 1.000 m²",
      src_ca_basico_resolution: "LC 236/2017 prevalece (posterior).",
    })
    expect(com.ok).toBe(true)
    if (!com.ok) return
    expect(com.data.sources.find((x) => x.field === "ca_basico")).toMatchObject({
      page: 77,
      condition: "Lotes acima de 1.000 m²",
      resolution_note: "LC 236/2017 prevalece (posterior).",
    })
  })

  it("aponta fonte incompleta mesmo em rascunho", () => {
    const result = parseRuleForm({ ...base, src_ca_max_article: "Art. 3" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.src_ca_max).toEqual(["Informe a lei e o artigo da fonte."])
  })

  it("checa a ordem dos coeficientes", () => {
    const result = parseRuleForm({ ...base, ca_min: "2,5", ca_basico: "2", ca_max: "1,5" })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.ca_min).toBeDefined()
    expect(result.fieldErrors.ca_max).toBeDefined()
  })

  it("exige o uso", () => {
    const result = parseRuleForm({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.fieldErrors.use_type).toEqual(["Selecione o uso."])
  })
})
