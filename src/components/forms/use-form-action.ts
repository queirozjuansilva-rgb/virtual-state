"use client"

import { startTransition, useActionState, useEffect, type FormEvent } from "react"
import { toast } from "sonner"

import { initialFormState, type FormState } from "@/lib/forms"

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

/**
 * Envia o formulário para uma Server Action sem o reset automático do React
 * (o usuário não perde o que digitou quando a validação falha). O botão que
 * submeteu entra no FormData (útil para "Salvar" × "Salvar e validar").
 */
export function useFormAction(action: Action) {
  const [state, dispatch, pending] = useActionState(action, initialFormState)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
  }, [state])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const formData = new FormData(event.currentTarget, submitter)
    startTransition(() => dispatch(formData))
  }

  const errorsFor = (name: string) => state.fieldErrors?.[name]

  return { state, pending, onSubmit, errorsFor }
}
