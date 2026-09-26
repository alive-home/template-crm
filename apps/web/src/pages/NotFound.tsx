import { Link } from "@tanstack/react-router"
import { Button } from "#/components/ui/button.tsx"

const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="font-semibold text-6xl text-foreground tracking-tight">404</p>
        <p className="mt-3 text-muted-foreground">That page doesn't exist.</p>
        <Button asChild className="mt-6">
          <Link to="/crm">Back to the CRM</Link>
        </Button>
      </div>
    </div>
  )
}

export default NotFound
