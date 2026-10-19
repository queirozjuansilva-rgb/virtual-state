/**
 * Operação de migration no banco compartilhado (dev = produção).
 *
 * - ensaio: a migration inteira num único DO que termina sempre em exceção
 *   (SQLSTATE ENS01), com o resumo da verificação na mensagem. Por ser um único
 *   comando que falha, nada é gravado.
 * - aplicacaoAtomica: a mesma migration num único DO, sem a exceção. Um comando
 *   só é uma transação só: ou tudo entra, ou nada entra, qualquer que seja o modo
 *   de execução do cliente (transação explícita, implícita ou autocommit).
 *
 * Integridade: os dois guardam o md5 do arquivo da migration e conferem o texto
 * recebido pelo banco antes de executar. Se o SQL for alterado no caminho (cópia,
 * transcrição), a execução para com SQLSTATE ENS02 e nada é gravado.
 *
 * Uso:
 *   node supabase/operacoes/ensaio.mts <migration.sql> <verificacao.sql> > ensaio.sql
 *   node supabase/operacoes/ensaio.mts --aplicar <migration.sql> > aplicar.sql
 * Testado em src/server/admin/pendencia-juridica.test.ts.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

function conferirDelimitadores(sql: string) {
  if (/\$(ensaio|aplicar|migracao)\$/.test(sql)) {
    throw new Error("O SQL já usa um dos delimitadores $ensaio$, $aplicar$ ou $migracao$.")
  }
}

const md5 = (texto: string) => createHash("md5").update(texto, "utf8").digest("hex")

/** Declara v_sql com a migration e confere o md5 antes de qualquer execução. */
function migracaoConferida(migracao: string): { declaracao: string; conferencia: string[] } {
  return {
    declaracao: `  v_sql text := $migracao$${migracao}$migracao$;`,
    conferencia: [
      `  if md5(v_sql) <> '${md5(migracao)}' then`,
      "    raise exception using errcode = 'ENS02',",
      "      message = 'O texto da migration difere do arquivo (md5). Nada foi executado.';",
      "  end if;",
    ],
  }
}

export function aplicacaoAtomica(migracao: string): string {
  conferirDelimitadores(migracao)
  const { declaracao, conferencia } = migracaoConferida(migracao)
  return [
    "do $aplicar$",
    "declare",
    declaracao,
    "begin",
    ...conferencia,
    "  execute v_sql;",
    "end",
    "$aplicar$;",
  ].join("\n")
}

export function ensaio(migracao: string, verificacao: string): string {
  conferirDelimitadores(migracao + verificacao)
  const { declaracao, conferencia } = migracaoConferida(migracao)
  return [
    "do $ensaio$",
    "declare",
    declaracao,
    "  v_resumo text;",
    "begin",
    ...conferencia,
    "  execute v_sql;",
    verificacao,
    "  raise exception using errcode = 'ENS01',",
    "    message = 'ENSAIO CONCLUÍDO, NADA FOI GRAVADO: ' || coalesce(v_resumo, '');",
    "end",
    "$ensaio$;",
  ].join("\n")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  if (args[0] === "--aplicar" && args[1]) {
    process.stdout.write(aplicacaoAtomica(readFileSync(args[1], "utf8")))
  } else if (args.length === 2) {
    process.stdout.write(ensaio(readFileSync(args[0], "utf8"), readFileSync(args[1], "utf8")))
  } else {
    console.error(
      "Uso: node supabase/operacoes/ensaio.mts <migration.sql> <verificacao.sql>\n" +
        "     node supabase/operacoes/ensaio.mts --aplicar <migration.sql>",
    )
    process.exit(1)
  }
}
