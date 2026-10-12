"use client"

import { Loader2 } from "lucide-react"
import { useActionState } from "react"

import { sendMagicLink, signInWithPassword, type AuthFormState } from "@/app/(auth)/actions"
import { FormStatus } from "@/components/auth/form-status"
import { TextField } from "@/components/auth/text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const initial: AuthFormState = {}

export function LoginForms({ next, linkError }: { next: string; linkError: boolean }) {
  return (
    <Tabs defaultValue="senha" className="gap-6">
      <TabsList className="w-full">
        <TabsTrigger value="senha">Com senha</TabsTrigger>
        <TabsTrigger value="link">Com link por e-mail</TabsTrigger>
      </TabsList>
      <TabsContent value="senha">
        <PasswordForm next={next} linkError={linkError} />
      </TabsContent>
      <TabsContent value="link">
        <MagicLinkForm next={next} />
      </TabsContent>
    </Tabs>
  )
}

function PasswordForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [state, action, pending] = useActionState(signInWithPassword, initial)
  const error =
    state.error ?? (linkError ? "O link é inválido ou expirou. Entre novamente." : undefined)

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <FormStatus error={error} />
        <TextField
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
        <TextField
          name="password"
          label="Senha"
          type="password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Entrar
        </Button>
      </FieldGroup>
    </form>
  )
}

function MagicLinkForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial)

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        <FormStatus error={state.error} message={state.message} />
        <TextField
          name="email"
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          errors={state.fieldErrors?.email}
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Enviar link de acesso
        </Button>
        <p className="text-sm text-muted-foreground">
          Você recebe um link para entrar sem senha. Se ainda não tiver conta, ela é criada.
        </p>
      </FieldGroup>
    </form>
  )
}
