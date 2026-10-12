import { CircleAlert, MailCheck } from "lucide-react"

export function FormStatus({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {error}
      </p>
    )
  }
  if (message) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {message}
      </p>
    )
  }
  return null
}
