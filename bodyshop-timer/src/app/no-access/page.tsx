import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";

export default async function NoAccess() {
  const { role, email } = await requireStaff();
  if (role) redirect(role === "owner" ? "/dashboard" : "/admin");
  return (
    <main className="ab-shell grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="cut max-w-md border border-line bg-bg p-7 text-center">
        <h1 className="mb-2 font-display text-[24px] font-bold uppercase tracking-[.06em]">No access yet</h1>
        <p className="mb-6 text-sm text-stone-600">
          {`${email} is signed in but hasn't been given a role yet. Ask the admin to add you.`}
        </p>
        <form action={signOut}>
          <Button variant="secondary">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
