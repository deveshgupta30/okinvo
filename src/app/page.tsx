import { Button } from "@/components/ui/button";

export default function Page() {
  return (
    <main className="mx-auto max-w-[1280px] p-lg">
      <h1 className="text-app-title text-ink">okinvo</h1>
      <p className="mt-xs text-app-body text-ink-subtle">Scaffold. Real pages arrive in Task 7.</p>
      <div className="mt-lg flex gap-sm">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="destructive">Destructive</Button>
        <span className="rounded-pill bg-surface-2 px-xs py-[2px] text-app-caption text-ink-muted">
          status-badge
        </span>
      </div>
    </main>
  );
}
