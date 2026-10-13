import { cn } from "@/lib/utils"

export function ListaAvisos({
  titulo,
  itens,
  destaque,
}: {
  titulo: string
  itens: string[]
  destaque?: boolean
}) {
  if (itens.length === 0) return null
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border px-3 py-2 text-sm",
        destaque ? "border-destructive/30 bg-destructive/10" : "bg-muted/40",
      )}
    >
      <p className="font-semibold">{titulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
