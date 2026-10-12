"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { EMPTY_SELECT_VALUE } from "@/lib/forms"

type BaseProps = {
  name: string
  label: string
  description?: React.ReactNode
  errors?: string[]
}

function ids(name: string) {
  const id = `field-${name}`
  return { id, errorId: `${id}-error`, descriptionId: `${id}-description` }
}

function describedBy(invalid: boolean, hasDescription: boolean, name: string) {
  const { errorId, descriptionId } = ids(name)
  return (
    [invalid && errorId, hasDescription && descriptionId].filter(Boolean).join(" ") || undefined
  )
}

export function TextareaField({
  name,
  label,
  description,
  errors,
  ...props
}: BaseProps & Omit<React.ComponentProps<typeof Textarea>, "id" | "name">) {
  const { id, errorId, descriptionId } = ids(name)
  const invalid = Boolean(errors?.length)
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(invalid, Boolean(description), name)}
        {...props}
      />
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

export function SelectField({
  name,
  label,
  description,
  errors,
  options,
  defaultValue,
  placeholder = "Selecione…",
  allowEmpty = false,
  emptyLabel = "Nenhum",
  disabled,
  onValueChange,
}: BaseProps & {
  options: readonly (readonly [string, string])[]
  defaultValue?: string | null
  placeholder?: string
  /** Mostra uma opção "nenhum" (envia vazio). */
  allowEmpty?: boolean
  emptyLabel?: string
  disabled?: boolean
  onValueChange?: (value: string) => void
}) {
  const { id, errorId, descriptionId } = ids(name)
  const invalid = Boolean(errors?.length)
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        name={name}
        defaultValue={defaultValue ?? (allowEmpty ? EMPTY_SELECT_VALUE : undefined)}
        disabled={disabled}
        onValueChange={onValueChange}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(invalid, Boolean(description), name)}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value={EMPTY_SELECT_VALUE}>{emptyLabel}</SelectItem>}
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

export function CheckboxField({
  name,
  label,
  description,
  errors,
  defaultChecked,
  disabled,
}: BaseProps & { defaultChecked?: boolean; disabled?: boolean }) {
  const { id, errorId, descriptionId } = ids(name)
  const invalid = Boolean(errors?.length)
  return (
    <Field orientation="horizontal" data-invalid={invalid || undefined}>
      <Checkbox
        id={id}
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(invalid, Boolean(description), name)}
      />
      <div className="grid gap-1">
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
        <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
      </div>
    </Field>
  )
}
