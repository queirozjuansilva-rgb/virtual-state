import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

type TextFieldProps = Omit<React.ComponentProps<typeof Input>, "id"> & {
  name: string
  label: string
  description?: React.ReactNode
  errors?: string[]
  /** Sufixo visual (ex.: "m²", "%", "R$"). */
  unit?: string
}

export function TextField({
  name,
  label,
  description,
  errors,
  unit,
  ...inputProps
}: TextFieldProps) {
  const id = `field-${name}`
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`
  const invalid = Boolean(errors?.length)
  const describedBy = [invalid && errorId, description && descriptionId].filter(Boolean).join(" ")

  const input = (
    <Input
      id={id}
      name={name}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy || undefined}
      className={unit ? "pr-10" : undefined}
      {...inputProps}
    />
  )

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {unit ? (
        <div className="relative">
          {input}
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {unit}
          </span>
        </div>
      ) : (
        input
      )}
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      <FieldError id={errorId} errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}
