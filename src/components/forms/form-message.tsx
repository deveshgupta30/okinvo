import type { ActionState } from "@/server/actions/shared";

/** Form-level error banner for `useActionState` results. */
export function FormMessage({ state }: { state: ActionState }) {
  if (!state || state.ok) return null;
  const formErrors = state.fieldErrors._form ?? [];
  return (
    <div
      role="alert"
      className="rounded-md border border-semantic-danger/40 bg-surface-2 px-4 py-3 text-app-body text-semantic-danger"
    >
      {state.message}
      {formErrors.length ? <span className="block">{formErrors.join(" ")}</span> : null}
    </div>
  );
}
