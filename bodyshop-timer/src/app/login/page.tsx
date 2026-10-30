import { signIn } from "./actions";
import { Button, Field, Flash, Input } from "@/components/ui";
import type { FlashParams } from "@/lib/flash";

export default async function LoginPage({ searchParams }: { searchParams: FlashParams }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={signIn} className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Bodyshop Job Timer</h1>
        <p className="mb-6 text-sm text-stone-500">Front office and owner sign-in</p>
        <Flash error={error} />
        <div className="flex flex-col gap-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit">Sign in</Button>
        </div>
      </form>
    </main>
  );
}
