import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui";
import { requireStaff } from "@/lib/auth";

export default async function NoAccess() {
  const { role, email } = await requireStaff();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md rounded-lg border border-stone-200 bg-white p-6 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">No admin access</h1>
        <p className="mb-6 text-sm text-stone-600">
          {role === "owner"
            ? "You're signed in as the owner. The owner dashboard arrives in a later build."
            : `${email} is signed in but hasn't been given a role yet. Ask the admin to add you.`}
        </p>
        <form action={signOut}>
          <Button variant="secondary">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
