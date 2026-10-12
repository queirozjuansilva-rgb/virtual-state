import type { Enums } from "@/lib/supabase/database.types"

export type AppRole = Enums<"app_role">

// TODO(cliente): rótulos de plano dependem do modelo de negócio (pendência 5).
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador · virtual.estate",
  analista: "Engenheiro analista",
  membro: "Incorporadora",
  proprietario: "Proprietário",
}
