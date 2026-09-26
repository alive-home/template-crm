import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "lucide-react"
import { useTheme } from "next-themes"
import { forwardRef } from "react"
import * as sonner from "sonner"

type ToasterProps = React.ComponentProps<typeof sonner.Toaster>
type ToasterTheme = NonNullable<ToasterProps["theme"]>

/** next-themes hands back any string it finds in storage, so the three sonner accepts are checked. */
function toasterTheme(value: string): ToasterTheme {
  return value === "light" || value === "dark" ? value : "system"
}

const Toaster = forwardRef<HTMLDivElement, ToasterProps>(function Toaster(props, ref) {
  const { theme = "system" } = useTheme()

  return (
    <div ref={ref}>
      <sonner.Toaster
        theme={toasterTheme(theme)}
        className="toaster group"
        icons={{
          success: <CircleCheck className="h-4 w-4" />,
          info: <Info className="h-4 w-4" />,
          warning: <TriangleAlert className="h-4 w-4" />,
          error: <OctagonX className="h-4 w-4" />,
          loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
        }}
        toastOptions={{
          classNames: {
            toast:
              "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
            description: "group-[.toast]:text-muted-foreground",
            actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
            cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          },
        }}
        {...props}
      />
    </div>
  )
})

export { Toaster }
