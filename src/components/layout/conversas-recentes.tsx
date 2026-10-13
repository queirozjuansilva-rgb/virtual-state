import { SidebarMenu } from "@/components/ui/sidebar"
import { getCurrentUser } from "@/lib/auth/dal"
import { createClient } from "@/lib/supabase/server"

import { ConversaItem } from "./conversa-item"

/** Histórico de conversas do usuário (as 30 mais recentes). */
export async function ConversasRecentes() {
  const user = await getCurrentUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30)

  if (!data?.length) {
    return <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma análise ainda.</p>
  }
  return (
    <SidebarMenu>
      {data.map((c) => (
        <ConversaItem key={c.id} id={c.id} titulo={c.title} />
      ))}
    </SidebarMenu>
  )
}
