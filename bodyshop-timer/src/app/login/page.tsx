import { signIn } from "./actions";
import { Button, Field, Flash, Input, Logo } from "@/components/ui";
import type { FlashParams } from "@/lib/flash";

export default async function LoginPage({ searchParams }: { searchParams: FlashParams }) {
  const { error } = await searchParams;
  return (
    <main className="ab-shell grid-bg flex min-h-screen items-center justify-center p-4">
      <form action={signIn} className="cut flex w-full max-w-sm flex-col gap-5 border border-neon bg-bg p-7 shadow-[0_0_24px_rgba(0,238,234,.25)]">
        <div className="flex flex-col gap-3">
          <Logo size={24} />
          <span className="font-mono text-[12px] uppercase tracking-[.12em] text-muted">// Workshop OS · sign in</span>
        </div>
        <Flash error={error} />
        <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <Button type="submit">Sign in</Button>
      </form>
    </main>
  );
}
