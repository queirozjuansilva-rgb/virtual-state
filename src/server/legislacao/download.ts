import "server-only"

import { lookup } from "node:dns/promises"

import { ipNaoPublico } from "@/lib/net/ip"

import { MAX_BYTES_PDF } from "./pdf"

/**
 * Baixa um arquivo de fonte oficial pela URL (admin): PDF de lei ou GeoJSON de
 * camada. Defesas contra SSRF: só HTTPS na porta padrão, todo IP do host
 * precisa ser público (conferido a cada redirecionamento), até 3
 * redirecionamentos, limite de tamanho e 60 s. Resta o risco de DNS rebinding
 * entre a checagem e a conexão, aceitável para uma ação só de admin (ADR 0011).
 */
export async function baixarArquivoOficial(
  endereco: string,
  maxBytes: number,
): Promise<Uint8Array> {
  let url = new URL(endereco)
  for (let salto = 0; salto <= 3; salto++) {
    if (
      url.protocol !== "https:" ||
      (url.port && url.port !== "443") ||
      url.username ||
      url.password
    ) {
      throw new Error("Use um endereço https:// público.")
    }
    const ips = await lookup(url.hostname, { all: true }).catch(() => [])
    if (ips.length === 0 || ips.some((r) => ipNaoPublico(r.address))) {
      throw new Error("Endereço não permitido.")
    }
    const resposta = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) })
    if (resposta.status >= 300 && resposta.status < 400) {
      const destino = resposta.headers.get("location")
      if (!destino) throw new Error("Redirecionamento sem destino.")
      url = new URL(destino, url)
      continue
    }
    if (!resposta.ok || !resposta.body) throw new Error(`A fonte respondeu ${resposta.status}.`)
    const declarado = Number(resposta.headers.get("content-length") ?? 0)
    const limite = `${Math.round(maxBytes / 1048576)} MB`
    if (declarado > maxBytes) throw new Error(`O arquivo passa de ${limite}.`)

    const partes: Uint8Array[] = []
    let total = 0
    const leitor = resposta.body.getReader()
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      total += value.length
      if (total > maxBytes) {
        await leitor.cancel()
        throw new Error(`O arquivo passa de ${limite}.`)
      }
      partes.push(value)
    }
    const bytes = new Uint8Array(total)
    let pos = 0
    for (const p of partes) {
      bytes.set(p, pos)
      pos += p.length
    }
    return bytes
  }
  throw new Error("Redirecionamentos demais.")
}

export async function baixarPdfOficial(endereco: string): Promise<Uint8Array> {
  const bytes = await baixarArquivoOficial(endereco, MAX_BYTES_PDF)
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
    throw new Error("O endereço não devolveu um PDF.")
  return bytes
}
