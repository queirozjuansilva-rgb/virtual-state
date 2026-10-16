/**
 * Link público do relatório: página em /r/<token> e PDF em /r/<token>/pdf.
 * O token é base64url de 32 bytes (43 caracteres), gerado no servidor.
 */

/** Mesmo formato que `carregarCompartilhado` aceita: base64url com 32+ caracteres. */
export const FORMATO_TOKEN_PUBLICO = /^[A-Za-z0-9_-]{32,}$/

/** Token da página do link público ("/r/<token>"); null para outras rotas, inclusive o PDF. */
export function tokenDaPaginaPublica(pathname: string): string | null {
  const m = /^\/r\/([^/]+)\/?$/.exec(pathname)
  return m ? m[1] : null
}

/**
 * Caminho sem rota no app: reescrever para ele mostra a página "não
 * encontrada" padrão (src/app/not-found.tsx), com HTTP 404.
 */
export const CAMINHO_NAO_ENCONTRADO = "/_link-publico-indisponivel"
