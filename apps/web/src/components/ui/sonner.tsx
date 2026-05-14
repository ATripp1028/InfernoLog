import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-[var(--color-bg-elevated)] group-[.toaster]:text-foreground group-[.toaster]:border-[var(--color-border)] group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-[var(--color-bg-subtle)] group-[.toast]:text-foreground',
        },
      }}
      {...props}
    />
  )
}

export { toast } from 'sonner'
