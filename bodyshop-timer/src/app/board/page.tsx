import type { Metadata, Viewport } from "next";
import { Board } from "./Board";
import { kioskDb, kioskKey, type BoardData } from "@/lib/kiosk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wall board · Bodyshop Job Timer" };
export const viewport: Viewport = { themeColor: "#0c0a09", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default async function BoardPage() {
  const key = await kioskKey();
  const { data, error } = key ? await kioskDb().rpc("kiosk_board", { p_key: key }) : { data: null, error: null };

  if (!data?.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-950 p-8 text-center text-stone-100">
        <div className="max-w-lg">
          <h1 className="mb-4 text-3xl font-bold">Wall board not set up</h1>
          {error ? (
            <p className="text-lg text-red-300">Can&apos;t reach the database right now. Check the internet connection and reload.</p>
          ) : (
            <p className="text-lg text-stone-300">
              This device isn&apos;t paired yet. An admin signs in on this tablet, opens <b>Settings</b>, and taps{" "}
              <b>Use this device as the wall board</b>.
            </p>
          )}
          <a href="/login" className="mt-8 inline-block rounded-xl bg-orange-700 px-8 py-4 text-xl font-semibold">Admin sign-in</a>
        </div>
      </main>
    );
  }
  return <Board data={data as BoardData} />;
}
