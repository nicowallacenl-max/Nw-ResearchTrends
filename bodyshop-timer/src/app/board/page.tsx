import type { Metadata, Viewport } from "next";
import { Board } from "./Board";
import { kioskDb, kioskKey, type BoardData } from "@/lib/kiosk";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wall board · Bodyshop Job Timer" };
export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default async function BoardPage() {
  const key = await kioskKey();
  const { data, error } = key ? await kioskDb().rpc("kiosk_board", { p_key: key }) : { data: null, error: null };

  if (!data?.ok) {
    return (
      <main className="ab-shell grid-bg flex min-h-screen items-center justify-center p-8 text-center text-ink">
        <div className="cut flex max-w-lg flex-col items-center gap-4 border border-line bg-bg p-8">
          <Logo />
          <h1 className="m-0 font-display text-[28px] font-bold uppercase tracking-[.06em]">Wall board not set up</h1>
          {error ? (
            <p className="text-[16px] text-progress">Can&apos;t reach the database right now. Check the internet connection and reload.</p>
          ) : (
            <p className="text-[16px] text-body">
              This device isn&apos;t paired yet. An admin signs in on this tablet, opens <b>Settings</b>, and taps{" "}
              <b>Use this device as the wall board</b>.
            </p>
          )}
          <a href="/login" className="plain cut-sm mt-2 inline-flex min-h-16 items-center bg-neon px-8 font-display text-[18px] font-bold uppercase tracking-[.1em] text-on-neon no-underline">Admin sign-in</a>
        </div>
      </main>
    );
  }
  return <Board data={data as BoardData} />;
}
