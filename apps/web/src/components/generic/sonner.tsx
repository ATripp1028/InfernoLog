import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * Every toast (success/error/warning/info/loading + the persistent import
 * toast) renders via toast.custom() and fully self-styles — see
 * components/ui/toast.tsx — so no default toastOptions.classNames are needed
 * here beyond layout.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-left"
      offset={16}
      mobileOffset={{
        bottom: 'calc(72px + env(safe-area-inset-bottom) + 16px)',
      }}
      {...props}
    />
  )
}

export { toast } from './toast'
