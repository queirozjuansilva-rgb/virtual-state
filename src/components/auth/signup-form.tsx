"use client"

import { Loader2 } from "lucide-react"
import { useActionState } from "react"

import { signUp, type AuthFormState } from "@/app/(auth)/actions"
import { FormStatus } from "@/components/auth/form-status"
import { TextField } from "@/components/auth/text-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"

const initial: AuthFormState = {}

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial)

  if (state.message) return <FormStatus message={state.message} />

  return (
    <form action={action} noValidate>
      <FieldGroup>
        <FormStatus error={state.error} />
        <TextField
          name="fullName"
          label="Nome completo"
          autoComplete="name"
          required
          defaultValue={state.values?.fullName}
          errors={state.fieldErrors?.fullName}
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          errors={state.fieldErrors?.password}
        />
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Criar conta
        </Button>
      </FieldGroup>
    </form>
  )
}
