import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** `notFound()` from any signed-in page: rendered inside the shell, sidebar intact. */
export default function AppNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Not found"
      description="This record does not exist, or it was deleted while you were looking at it."
      action={
        <Button asChild variant="secondary">
          <Link href="/">Back to the dashboard</Link>
        </Button>
      }
    />
  );
}
