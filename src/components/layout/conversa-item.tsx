"use client"

import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { excluirConversa, renomearConversa } from "@/server/copiloto/actions"

export function ConversaItem({ id, titulo }: { id: string; titulo: string }) {
  const href = `/chat/${id}`
  const ativo = usePathname() === href
  const router = useRouter()
  const [renomeando, setRenomeando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [pendente, iniciar] = useTransition()

  function salvarTitulo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const novo = String(new FormData(e.currentTarget).get("titulo") ?? "")
    iniciar(async () => {
      const r = await renomearConversa(id, novo)
      if (!r.ok) {
        toast.error(r.erro)
        return
      }
      setRenomeando(false)
    })
  }

  function excluir() {
    iniciar(async () => {
      const r = await excluirConversa(id)
      if (!r.ok) {
        toast.error("Não foi possível excluir a conversa.")
        return
      }
      setExcluindo(false)
      if (ativo) router.push("/")
    })
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={ativo} tooltip={titulo}>
        <Link href={href}>
          <MessageSquare aria-hidden />
          <span>{titulo}</span>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover aria-label={`Ações da conversa ${titulo}`}>
            <MoreHorizontal aria-hidden />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem onSelect={() => setRenomeando(true)}>
            <Pencil aria-hidden />
            Renomear
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setExcluindo(true)}>
            <Trash2 aria-hidden />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renomeando} onOpenChange={setRenomeando}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={salvarTitulo} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Renomear conversa</DialogTitle>
            </DialogHeader>
            <label htmlFor={`titulo-${id}`} className="sr-only">
              Título
            </label>
            <Input
              id={`titulo-${id}`}
              name="titulo"
              defaultValue={titulo}
              maxLength={120}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenomeando(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluindo} onOpenChange={setExcluindo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              “{titulo}” e os anexos dela serão excluídos. Os estudos registrados continuam no
              histórico de análises da organização.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pendente}
              onClick={(e) => {
                e.preventDefault()
                excluir()
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenuItem>
  )
}
