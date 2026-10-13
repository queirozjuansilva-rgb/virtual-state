import type { Metadata } from "next"

import { BoasVindas } from "@/components/chat/boas-vindas"
import { ChatWorkspace } from "@/components/chat/chat-workspace"
import { temChaveAnthropic } from "@/lib/ai/config"
import { ENGINE_VERSION } from "@/lib/feasibility/version"

export const metadata: Metadata = { title: "Nova análise" }

export default function NovaAnalisePage() {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <ChatWorkspace
        conversaId={null}
        itensIniciais={[]}
        terrenoInicial={null}
        versaoMotor={ENGINE_VERSION}
        boasVindas={<BoasVindas configurado={temChaveAnthropic()} />}
      />
    </div>
  )
}
