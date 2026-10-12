import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type TextFieldProps = Omit<React.ComponentProps<typeof Input>, "id"> & {
  name: string
  label: string
  errors?: string[]
}

export function TextField({ name, label, errors, ...inputProps }: TextFieldProps) {
  const id = `field-${name}`
  const errorId = `${id}-error`
  const invalid = Boolean(errors?.length)

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        {...inputProps}
      />
      <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}
