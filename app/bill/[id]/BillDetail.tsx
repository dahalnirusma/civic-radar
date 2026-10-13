"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";

type BillInfo = {
  id: number;
  identifier: string;
  title: string;
  summary: string | null;
  openstates_url: string | null;
};
type KeywordInfo = { id: number; name: string };
type JustificationState =
  | { status: "done"; text: string; quote: string }
  | { status: "none" };
type LoadStatus = "loading" | "ready" | "notfound" | "error";

const panelClass =
  "rounded-2xl border border-white/50 bg-blue-100/10 p-6 shadow-[0_4px_4px_rgba(219,234,254,0.3)]";

export default function BillDetail({
  billId,
  keywordIds,
  countyFips,
}: {
  billId: string;
  keywordIds: string;
  countyFips: string;
}) {
  const router = useRouter();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [bill, setBill] = useState<BillInfo | null>(null);
  const [keywords, setKeywords] = useState<KeywordInfo[]>([]);
  const [justifications, setJustifications] = useState<Record<number, JustificationState>>({});

  useEffect(() => {
    let cancelled = false;
    const ids = keywordIds
      .split(",")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);

    
    for (const kid of ids) {
      (async () => {
        let result: JustificationState = { status: "none" };
        try {
          const r = await fetch(`/api/justification?bill=${billId}&keyword=${kid}&county=${countyFips}`);
          if (r.ok) {
            const j = await r.json();
            if (j.justification) {
              result = { status: "done", text: j.justification.text, quote: j.justification.quote };
            }
          }
        } catch {
          
        }
        if (!cancelled) setJustifications((prev) => ({ ...prev, [kid]: result }));
      })();
    }

    async function load() {
      try {
        const res = await fetch(`/api/bill?id=${billId}&keywords=${keywordIds}`);
        if (res.status === 404) {
          if (!cancelled) setLoadStatus("notfound");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setLoadStatus("error");
          return;
        }
        const data: { bill: BillInfo; keywords: KeywordInfo[] } = await res.json();
        if (cancelled) return;
        setBill(data.bill);
        setKeywords(data.keywords);
        setLoadStatus("ready");
      } catch {
        if (!cancelled) setLoadStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [billId, keywordIds, countyFips]);

  return (
    <main className="min-h-dvh bg-black px-5 pt-6 pb-16 text-white">
      <div className="mx-auto w-full max-w-[760px]">
        <BackButton label="Back to results" onClick={() => router.back()} />

        {loadStatus === "loading" && <p className="mt-8 font-bold text-blue-100">Loading…</p>}
        {loadStatus === "notfound" && (
          <p role="alert" className="mt-8 font-bold text-red-300">
            We couldn’t find that bill for those topics.
          </p>
        )}
        {loadStatus === "error" && (
          <p role="alert" className="mt-8 font-bold text-red-300">
            Something went wrong loading this bill. Try again.
          </p>
        )}

        {loadStatus === "ready" && bill && (
          <div className="mt-8 space-y-6">
            <h1 className="text-[clamp(1.5rem,4vw,2.25rem)] leading-tight font-bold">
              <span className="text-blue-200">{bill.identifier}</span> {bill.title}
            </h1>

            <section className={panelClass}>
              <h2 className="text-lg font-bold">What the bill does</h2>
              {bill.summary ? (
                <p className="font-inter mt-2 leading-relaxed text-blue-100/90">{bill.summary}</p>
              ) : (
                <p className="font-inter mt-2 text-blue-100/70 italic">No summary available yet.</p>
              )}
            </section>

            {keywords.map((k) => {
              const j = justifications[k.id];
              return (
                <section className={panelClass} key={k.id}>
                  <h2 className="text-lg font-bold">Why it matched “{k.name}”</h2>
                  {!j && (
                    <p className="font-inter mt-2 text-blue-100/80">
                      Writing an explanation. The first time can take a few seconds.
                    </p>
                  )}
                  {j?.status === "none" && (
                    <p className="font-inter mt-2 text-blue-100/80">
                      No explanation is available for this bill right now.
                    </p>
                  )}
                  {j?.status === "done" && (
                    <>
                      <p className="font-inter mt-2 leading-relaxed text-blue-100/90">{j.text}</p>
                      <p className="mt-4 text-sm font-bold text-blue-100/80">From the bill text:</p>
                      <blockquote className="font-inter mt-1 border-l-4 border-blue-100 pl-4 italic text-blue-100/90">
                        {j.quote}
                      </blockquote>
                    </>
                  )}
                </section>
              );
            })}

            {bill.openstates_url && (
              <a
                className="inline-block font-bold text-blue-200 underline underline-offset-4 hover:text-white"
                href={bill.openstates_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the full bill on Open States
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  );
}