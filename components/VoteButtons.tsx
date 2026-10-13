"use client";

type Vote = 1 | -1;

const buttonClass =
  "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-2 border-white/70 text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white aria-pressed:border-blue-100 aria-pressed:bg-blue-100 aria-pressed:text-[#0e1323]";

export default function VoteButtons({
  vote,
  onVote,
}: {
  vote?: Vote;
  onVote: (score: Vote) => void;
}) {
  return (
    <div className="relative z-10 mt-auto">
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/20 pt-4">
        <span className="text-sm font-bold text-blue-100/80">Is this relevant to your search?</span>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Relevant"
            aria-pressed={vote === 1}
            onClick={() => onVote(1)}
            className={buttonClass}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill={vote === 1 ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 10v12" />
              <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Not relevant"
            aria-pressed={vote === -1}
            onClick={() => onVote(-1)}
            className={buttonClass}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill={vote === -1 ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 14V2" />
              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}