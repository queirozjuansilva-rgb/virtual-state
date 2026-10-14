"use client"

import { FileUp, Globe, Loader2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { TextField } from "@/components/forms/text-field"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import {
  criarUrlDeEnvio,
  importarDaFonteOficial,
  registrarArquivo,
} from "@/server/legislacao/actions"

const MAX_BYTES = 50 * 1024 * 1024

/**
 * Duas formas de trazer o PDF: importar da fonte oficial pela URL (o servidor
 * baixa e a URL vira o link oficial) ou enviar do computador (direto ao
 * Storage, por URL assinada). Nos dois casos o servidor confere o arquivo e
 * guarda tamanho, páginas e impressão digital.
 */
export function EnvioPdf({
  documentoId,
  substituir,
  urlOficial,
  coleta,
}: {
  documentoId: string
  substituir: boolean
  urlOficial: string | null
  coleta: { collected_at: string | null; usage_rights: string | null }
}) {
  const [pending, startTransition] = useTransition()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [url, setUrl] = useState(urlOficial ?? "")

  const confirmar = () =>
    !substituir ||
    window.confirm(
      "Substituir o PDF apaga as páginas, o OCR e os trechos já processados. Continuar?",
    )

  function dadosColeta(form: FormData) {
    return {
      collected_at: String(form.get("collected_at") || "") || null,
      usage_rights: String(form.get("usage_rights") || "") || null,
    }
  }

  function enviar(form: FormData) {
    const intent = form.get("intent")
    if (!confirmar()) return
    startTransition(async () => {
      if (intent === "url") {
        const r = await importarDaFonteOficial(documentoId, url, dadosColeta(form))
        return void (r.ok ? toast.success(r.mensagem) : toast.error(r.erro))
      }
      if (!arquivo) return void toast.error("Escolha o PDF.")
      if (arquivo.size > MAX_BYTES) return void toast.error("O PDF passa de 50 MB.")
      const destino = await criarUrlDeEnvio(documentoId)
      if (!destino.ok) return void toast.error(destino.erro)
      const { error } = await createClient()
        .storage.from("legal-documents")
        .uploadToSignedUrl(destino.caminho, destino.token, arquivo, {
          contentType: "application/pdf",
          upsert: true,
        })
      if (error) return void toast.error("Falha no envio do arquivo.")
      const r = await registrarArquivo(documentoId, destino.caminho, dadosColeta(form))
      if (r.ok) {
        toast.success(r.mensagem)
        setArquivo(null)
      } else toast.error(r.erro)
    })
  }

  return (
    <form action={enviar} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2 sm:col-span-2">
        <TextField
          name="url"
          label={
            substituir
              ? "Substituir pela fonte oficial (URL do PDF)"
              : "URL do PDF na fonte oficial"
          }
          placeholder="https://sapl.fortaleza.ce.leg.br/media/…/texto_integral.pdf"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          description="Recomendado: o servidor baixa o arquivo e registra a origem. Só https, até 50 MB."
        />
        <div>
          <Button type="submit" name="intent" value="url" disabled={pending || !url.trim()}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Globe aria-hidden />}
            Importar da fonte oficial
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <label htmlFor="pdf-lei" className="text-sm font-medium">
          Ou envie do computador
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="pdf-lei"
            type="file"
            accept="application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
          <Button
            type="submit"
            name="intent"
            value="arquivo"
            variant="outline"
            disabled={pending || !arquivo}
          >
            <FileUp aria-hidden /> Enviar PDF
          </Button>
        </div>
      </div>
      <TextField
        name="collected_at"
        label="Data da coleta"
        type="date"
        defaultValue={coleta.collected_at ?? new Date().toISOString().slice(0, 10)}
        description="Quando o arquivo foi obtido (não é a vigência)."
      />
      <TextField
        name="usage_rights"
        label="Direito de uso"
        placeholder="Ex.: CC BY-SA 4.0 (SAPL da Câmara)"
        defaultValue={coleta.usage_rights ?? ""}
        maxLength={300}
      />
    </form>
  )
}
