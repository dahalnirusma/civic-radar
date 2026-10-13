"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { isValidKeywordShape } from "@/lib/validate";
import { RECENT_DAYS } from "@/lib/config";
import { getVoterId } from "@/lib/voter";
import BackButton from "@/components/BackButton";
import VoteButtons from "@/components/VoteButtons";

const MAX_KEYWORDS = 5; 
const SEARCH_KEY = "civic-radar-search"; 
const VOTES_KEY = "civic-radar-votes"; 

type CountyRow = {
  zip: string;
  county_fips: string;
  county_name: string;
  state_abbr: string;
  share: number;
};

type ZipStatus = "idle" | "loading" | "notfound" | "error";
type SearchStatus = "idle" | "searching" | "error";
type View = "landing" | "results";
type Vote = 1 | -1;

type Bill = {
  id?: number; // missing on "unverified" fallback bills
  identifier: string;
  title: string;
  summary?: string | null;
  openstates_url?: string | null;
};

type KeywordResult = {
  keyword: string;
  keywordId?: number;
  bills: Bill[];
  verified: boolean;
  unverified: Bill[];
  error?: string;
};

type Tag = { keyword: string; keywordId?: number };
type TaggedBill = Bill & { tags: Tag[] };

type SavedSearch = {
  view: View;
  unloadedState: string;
  keywords: string[];
  zip: string;
  counties: CountyRow[];
  countyFips: string;
  searchedCounty: string;
  results: KeywordResult[] | null;
};

// Combine every keyword's bills into one list. A bill that matched several
// keywords appears once, with one tag per keyword.
function mergeResults(results: KeywordResult[]): TaggedBill[] {
  const byIdentifier = new Map<string, TaggedBill>();

  for (const r of results) {
    if (r.error) continue;
    const bills = r.verified ? r.bills : r.unverified;

    for (const b of bills) {
      const tag: Tag = { keyword: r.keyword, keywordId: r.keywordId };
      const existing = byIdentifier.get(b.identifier);
      if (existing) {
        if (!existing.tags.some((t) => t.keyword === r.keyword)) existing.tags.push(tag);
        existing.id ??= b.id;
        existing.summary ??= b.summary;
        existing.openstates_url ??= b.openstates_url;
      } else {
        byIdentifier.set(b.identifier, { ...b, tags: [tag] });
      }
    }
  }

  return [...byIdentifier.values()].sort((a, b) => b.tags.length - a.tags.length);
}

function keywordIdsOf(bill: TaggedBill): number[] {
  return bill.tags.map((t) => t.keywordId).filter((id): id is number => id !== undefined);
}
const prefetched = new Set<string>();
function prefetchJustifications(bill: TaggedBill, countyFips: string) {
  if (bill.id === undefined) return;
  for (const kid of keywordIdsOf(bill)) {
    const key = `${bill.id}-${kid}-${countyFips}`;
    if (prefetched.has(key)) continue;
    prefetched.add(key);
    fetch(`/api/justification?bill=${bill.id}&keyword=${kid}&county=${countyFips}`).catch(() => {});
  }
}

function BillCard({
  bill,
  countyFips,
  vote,
  onVote,
}: {
  bill: TaggedBill;
  countyFips: string;
  vote?: Vote;
  onVote: (score: Vote) => void;
}) {
  const ids = keywordIdsOf(bill);
  const canOpen = bill.id !== undefined && ids.length > 0;
  const href = canOpen ? `/bill/${bill.id}?keywords=${ids.join(",")}&county=${countyFips}` : null;

  const heading = (
    <>
      <span className="text-blue-200">{bill.identifier}</span> {bill.title}
    </>
  );

  return (
    <li     
      onPointerEnter={() => canOpen && prefetchJustifications(bill, countyFips)}
      onFocus={() => canOpen && prefetchJustifications(bill, countyFips)}
      className="group relative flex flex-col rounded-2xl border border-white/50 bg-blue-100/10 p-6 shadow-[0_4px_4px_rgba(219,234,254,0.3)] transition hover:-translate-y-0.5 hover:border-white hover:bg-blue-100/15 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <ul className="mb-3 flex flex-wrap gap-2" aria-label="Matched topics">
        {bill.tags.map((t) => (
          <li key={t.keyword} className="rounded-full bg-blue-100 px-3 py-0.5 text-sm font-bold text-[#0e1323]">
            {t.keyword}
          </li>
        ))}
      </ul>

      <h3 className="text-lg leading-snug font-bold">
        {href ? (
          <Link
            href={href}
            className="underline-offset-4 group-hover:underline after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none"
          >
            {heading}
          </Link>
        ) : (
          heading
        )}
      </h3>

      {bill.summary ? (
        <p className="font-inter mt-3 text-[0.95rem] leading-relaxed text-blue-100/90">{bill.summary}</p>
      ) : (
        <p className="font-inter mt-3 text-[0.95rem] text-blue-100/70 italic">No summary available yet.</p>
      )}

      {bill.openstates_url && (
        <a
          className="relative z-10 mt-4 w-fit text-sm font-bold text-blue-200 underline underline-offset-4 hover:text-white"
          href={bill.openstates_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Read the bill on Open States
        </a>
      )}

      {canOpen && <VoteButtons vote={vote} onVote={onVote} />}
    </li>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [hydrated, setHydrated] = useState(false);

  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const [zip, setZip] = useState("");
  const [counties, setCounties] = useState<CountyRow[]>([]);
  const [countyFips, setCountyFips] = useState("");
  const [zipStatus, setZipStatus] = useState<ZipStatus>("idle");

  const [results, setResults] = useState<KeywordResult[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchedCounty, setSearchedCounty] = useState("");
  const [unloadedState, setUnloadedState] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const [votes, setVotes] = useState<Record<number, Vote>>({});

  // Restore the last search (and remembered votes) when the page loads
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SEARCH_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<SavedSearch>;
        setKeywords(s.keywords ?? []);
        setZip(s.zip ?? "");
        setCounties(s.counties ?? []);
        setCountyFips(s.countyFips ?? "");
        setSearchedCounty(s.searchedCounty ?? "");
        setUnloadedState(s.unloadedState ?? "");
        if (s.view === "results" && s.results) {
          setResults(s.results);
          setView("results");
        }
      }
      const rawVotes = localStorage.getItem(VOTES_KEY);
      if (rawVotes) setVotes(JSON.parse(rawVotes));
    } catch {
      
    }
    setHydrated(true);
  }, []);

 
  useEffect(() => {
    if (!hydrated) return;
    try {
      const saved: SavedSearch = { view, keywords, zip, counties, countyFips, searchedCounty, unloadedState, results };
      sessionStorage.setItem(SEARCH_KEY, JSON.stringify(saved));
    } catch {
      // ignore
    }
  }, [hydrated, view, keywords, zip, counties, countyFips, searchedCounty, unloadedState, results]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
    } catch {
      // ignore
    }
  }, [hydrated, votes]);

  const merged = results ? mergeResults(results) : [];
  const compact = view === "results";

  function addKeyword() {
    const k = draft.trim().toLowerCase();
    if (!k || keywords.includes(k) || keywords.length >= MAX_KEYWORDS) return;
    if (!isValidKeywordShape(k)) {
      setError("Enter a topic such as “housing” or “school funding” (at least 3 letters).");
      return;
    }
    setError("");
    setFormMessage("");
    setKeywords([...keywords, k]);
    setDraft("");
  }

  function removeKeyword(k: string) {
    setKeywords(keywords.filter((existing) => existing !== k));
  }

  async function handleZipChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    setZip(digits);

    setCounties([]);
    setCountyFips("");
    setZipStatus("idle");

    if (digits.length !== 5) return;

    setZipStatus("loading");
    try {
      const res = await fetch(`/api/zip?zip=${digits}`);
      if (res.status === 404) {
        setZipStatus("notfound");
        return;
      }
      if (!res.ok) {
        setZipStatus("error");
        return;
      }
      const data: { rows: CountyRow[] } = await res.json();
      setCounties(data.rows);
      setCountyFips(data.rows[0].county_fips);
      setZipStatus("idle");
      setFormMessage("");
    } catch {
      setZipStatus("error");
    }
  }

  async function runSearch(kws: string[]) {
    setFormMessage("");
    setView("results");
    setSearchStatus("searching");
    setResults(null);
    setUnloadedState("");
    setSearchedCounty(countyFips);
    try {
      const keywordParam = kws.map(encodeURIComponent).join(",");
      const res = await fetch(`/api/search?keyword=${keywordParam}&county=${countyFips}`);
      if (!res.ok) {
        setSearchStatus("error");
        return;
      }
      const data: { results: KeywordResult[]; stateLoaded?: boolean; county?: string } = await res.json();
      if (data.stateLoaded === false) setUnloadedState(data.county ?? "that state");
      setResults(data.results);
      setSearchStatus("idle");
    } catch {
      setSearchStatus("error");
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (searchStatus === "searching") return;

    // If a topic was typed but Enter wasn't pressed, add it now
    let kws = keywords;
    const pending = draft.trim().toLowerCase();
    if (pending && !kws.includes(pending) && kws.length < MAX_KEYWORDS) {
      if (!isValidKeywordShape(pending)) {
        setError("Enter a topic such as “housing” or “school funding” (at least 3 letters).");
        return;
      }
      kws = [...kws, pending];
      setKeywords(kws);
      setDraft("");
      setError("");
    }

    if (kws.length === 0) {
      setFormMessage("Add a topic first.");
      return;
    }
    if (!countyFips) {
      setFormMessage(
        zipStatus === "loading"
          ? "One moment, still looking up your zip code."
          : "Enter your zip code so we can find your county."
      );
      return;
    }
    runSearch(kws);
  }

  
  function goBack() {
    setView("landing");
    setResults(null);
    setSearchStatus("idle");
    setFormMessage("");
  }

  async function castVote(bill: TaggedBill, score: Vote) {
    const billId = bill.id;
    const keywordIds = keywordIdsOf(bill);
    if (billId === undefined || keywordIds.length === 0) return;

    const previous = votes[billId];
    if (previous === score) return;
    setVotes((v) => ({ ...v, [billId]: score }));

    try {
      const voter = getVoterId();
      const responses = await Promise.all(
        keywordIds.map((keyword) =>
          fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bill: billId, keyword, vote: score, voter }),
          })
        )
      );
      if (responses.some((r) => !r.ok)) throw new Error("vote failed");
    } catch {
      
      setVotes((v) => {
        const next = { ...v };
        if (previous === undefined) delete next[billId];
        else next[billId] = previous;
        return next;
      });
    }
  }


  if (!hydrated) return <main className="min-h-dvh bg-black" />;

  const labelClass = compact
    ? "mb-1.5 block pl-3 text-sm leading-normal font-bold"
    : "mb-2 block pl-3 text-base leading-normal font-bold";

  const fieldClass = "h-12 w-full rounded-full border-2 border-white bg-slate-600 px-5 text-center text-base font-bold text-white outline-none transition-colors placeholder:text-slate-300 focus:bg-slate-500 focus:ring-2 focus:ring-white/50";
  
  const noteClass = "mt-2 pl-3 text-sm font-bold text-blue-100";
  const alertClass = "mt-2 pl-3 text-sm font-bold text-red-300";

  const topicField = (
    <div>
      <label className={labelClass} htmlFor="topic">
        Topic
      </label>
      <input
        id="topic"
        name="topic"
        type="text"
        autoComplete="off"
        className={fieldClass}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault(); 
            addKeyword();
          }
        }}
        placeholder="type a topic, then press enter"
      />
      {error && (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      )}
      {keywords.length > 0 && (
        <ul className={`mt-3 flex flex-wrap gap-2 ${compact ? "justify-start" : "justify-center"}`}>
          {keywords.map((k) => (
            <li
              key={k}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 py-1 pr-1.5 pl-4 text-sm font-bold text-[#0e1323]"
            >
              {k}
              <button
                type="button"
                className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-lg leading-none hover:bg-[#0e1323]/15 focus-visible:outline-2 focus-visible:outline-[#0e1323]"
                onClick={() => removeKeyword(k)}
                aria-label={`Remove ${k}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const zipField = (
    <div>
      <label className={labelClass} htmlFor="zip-code">
        Zip code
      </label>
      <input
        id="zip-code"
        name="zipCode"
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={5}
        className={fieldClass}
        value={zip}
        onChange={(e) => handleZipChange(e.target.value)}
        placeholder="search for your county"
      />
      {zipStatus === "loading" && <p className={noteClass}>Looking up zip…</p>}
      {zipStatus === "notfound" && (
        <p role="alert" className={alertClass}>
          We couldn’t find that zip code.
        </p>
      )}
      {zipStatus === "error" && (
        <p role="alert" className={alertClass}>
          Something went wrong looking up that zip. Try again.
        </p>
      )}
      {counties.length === 1 && (
        <p className={noteClass}>
          {counties[0].county_name}, {counties[0].state_abbr}
        </p>
      )}
      {counties.length > 1 && (
        <div className="mt-4">
          <label className={labelClass} htmlFor="county">
            County
          </label>
          <select
            id="county"
            className={`${fieldClass} [&>option]:text-black`}
            value={countyFips}
            onChange={(e) => setCountyFips(e.target.value)}
          >
            {counties.map((c) => (
              <option key={c.county_fips} value={c.county_fips}>
                {c.county_name}, {c.state_abbr} ({Math.round(c.share * 100)}%)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  const submitButton = (
    <button
      type="submit"
      className={`cursor-pointer rounded-full border-2 border-white bg-blue-300 font-extrabold tracking-wide text-slate-900 shadow-[0_4px_4px_rgba(219,234,254,0.4)] transition-colors hover:bg-blue-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white active:translate-y-px ${
        compact
          ? "h-12 w-full px-8 text-xl sm:col-span-2 lg:col-span-1 lg:mt-8 lg:w-auto"
          : "mt-8 h-12 w-full text-2xl"
      }`}
    >
      {searchStatus === "searching" ? "Searching…" : "Find Bills"}
    </button>
  );

  const formMessageEl = formMessage && (
    <p role="alert" className={`${alertClass} ${compact ? "sm:col-span-2 lg:col-span-3" : "mt-4 text-center"}`}>
      {formMessage}
    </p>
  );

  if (view === "landing") {
    return (
      <main className="min-h-dvh bg-black px-5 pb-16 text-white">
        <div className="mx-auto flex w-full max-w-md flex-col items-center pt-[clamp(3rem,15vh,7rem)]">
          <header className="text-center">
            <h1 className="text-[clamp(2.25rem,10vw,3.5rem)] leading-none font-bold tracking-[-0.025em] whitespace-nowrap">
              CIVIC RADAR
            </h1>
            <p className="mt-2 text-sm leading-normal font-bold">
              keeping busy people up to date on legislative bills.
            </p>
          </header>

          <form className="mt-8 w-full" onSubmit={handleSubmit}>
            {topicField}
            <div className="mt-6">{zipField}</div>
            {submitButton}
            {formMessageEl}
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-black px-5 pt-6 pb-16 text-white">
      <div className="mx-auto w-full max-w-[1200px]">
        <BackButton label="Back" onClick={goBack} />

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <h1 className="text-[clamp(2rem,4vw,2.75rem)] leading-none font-bold tracking-[-0.025em] whitespace-nowrap lg:mt-8">
            CIVIC RADAR
          </h1>
          <form
            className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-start"
            onSubmit={handleSubmit}
          >
            {topicField}
            {zipField}
            {submitButton}
            {formMessageEl}
          </form>
        </div>

        <section className="mt-10" aria-live="polite">
          {searchStatus === "searching" && (
            <p className="font-bold text-blue-100">
              Searching. The first search for a new topic can take a few seconds.
            </p>
          )}
          {searchStatus === "error" && (
            <p role="alert" className="font-bold text-red-300">
              Something went wrong with the search. Please try again.
            </p>
          )}

          {results && (
            <>  {unloadedState && (
              <p className="font-bold text-blue-100">
                Civic Radar currently covers Virginia only. Enter a Virginia zip code to search.
              </p>
            )}
              <div className="space-y-2">
                {results
                  .filter((r) => r.error)
                  .map((r) => (
                    <p key={r.keyword} role="alert" className="font-bold text-red-300">
                      “{r.keyword}” isn’t a topic we recognize. Try a different word.
                    </p>
                  ))}
                {results
                  .filter((r) => !r.error && !r.verified)
                  .map((r) => (
                    <p key={r.keyword} className="font-bold text-blue-100">
                      We couldn’t verify the matches for “{r.keyword}” right now. Showing the closest bills we found.
                    </p>
                  ))}
                {results
                  .filter((r) => !r.error && r.verified && r.bills.length === 0)
                  .map((r) => (
                    <p key={r.keyword} className="font-bold text-blue-100">
                      No relevant bills for “{r.keyword}” with activity in the last {RECENT_DAYS} days.
                    </p>
                  ))}
              </div>

              {merged.length > 0 && (
                <ul className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {merged.map((b) => (
                    <BillCard
                      key={b.identifier}
                      bill={b}
                      countyFips={searchedCounty}
                      vote={b.id !== undefined ? votes[b.id] : undefined}
                      onVote={(score) => castVote(b, score)}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}