import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

const componentes: Components = {
  p: ({ className, ...props }) => <p className={cn("leading-relaxed", className)} {...props} />,
  ul: ({ className, ...props }) => (
    <ul className={cn("list-disc space-y-1 pl-5", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("list-decimal space-y-1 pl-5", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  a: ({ className, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn("text-primary underline underline-offset-4", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn("border-b bg-muted/50 px-3 py-1.5 text-left font-medium", className)}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("border-b px-3 py-1.5 tabular-nums last:border-b-0", className)} {...props} />
  ),
  h1: ({ className, ...props }) => <p className={cn("font-semibold", className)} {...props} />,
  h2: ({ className, ...props }) => <p className={cn("font-semibold", className)} {...props} />,
  h3: ({ className, ...props }) => <p className={cn("font-semibold", className)} {...props} />,
  code: ({ className, ...props }) => (
    <code className={cn("rounded bg-muted px-1 py-0.5 text-[0.85em]", className)} {...props} />
  ),
}

/** Markdown das respostas do copiloto (sem HTML bruto). */
export function Markdown({ texto }: { texto: string }) {
  return (
    <div className="space-y-3 text-sm break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {texto}
      </ReactMarkdown>
    </div>
  )
}
