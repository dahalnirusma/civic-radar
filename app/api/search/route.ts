import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { filterRelevant } from "@/lib/relevance";
import { getBillSummary } from "@/lib/summary";
import { RECENT_DAYS, SUPPORTED_STATES } from "@/lib/config";
import { getOrCreateKeyword, InvalidKeywordError } from "@/lib/keywords";
import { isValidKeywordShape } from "@/lib/validate";

export const maxDuration = 60;

const Min_simarity = 0.2;
const Top_N = 25;
const Max_keywords = 5;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keywords = (searchParams.get("keyword") ?? "")
    .split(",")
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, Max_keywords);
  const countyFips = searchParams.get("county") ?? "";

  if (keywords.length === 0 || !countyFips) {
    return NextResponse.json({ error: "keyword and county are required" }, { status: 400 });
  }

  const [county] = await sql`select fips, name, state_abbr from counties where fips = ${countyFips}`;
  if (!county) {
    return NextResponse.json({ error: "County not found" }, { status: 404 });
  }
      // Only some states are supported so far
  if (!SUPPORTED_STATES.includes(county.state_abbr)) {
    return NextResponse.json({ county: county.state_abbr, stateLoaded: false, results: [] });
  }
  const output = [];

  for (const keyword of keywords) {
    if (!isValidKeywordShape(keyword)) {
        output.push({ keyword, error: "Not a recognizable topic", bills: [], verified: true, unverified: [] });
        continue;
      }
  
      let keywordId: number;
      try {
        keywordId = await getOrCreateKeyword(keyword);
      } catch (err) {
        if (err instanceof InvalidKeywordError) {
          output.push({ keyword, error: "Not a recognizable topic", bills: [], verified: true, unverified: [] });
          continue;
        }
        throw err;   
      }

    const candidates = await sql`
      select b.id, b.identifier, b.title, b.latest_action_date, b.summary, b.status, b.openstates_url,
             (1 - (b.embedding <=> k.embedding))::float as similarity,
             r.llm_relevant
      from bills b
      join keywords k on k.id = ${keywordId}
      left join results r on r.bill_id = b.id and r.keyword_id = k.id
      where b.embedding is not null
        and b.state = ${county.state_abbr}
        and b.latest_action_date >= current_date - ${RECENT_DAYS}::int
        and (1 - (b.embedding <=> k.embedding)) >= ${Min_simarity}
      order by b.embedding <=> k.embedding
      limit ${Top_N}
    `;

    const uncheckedCandidates = candidates.filter(c => c.llm_relevant === null);
    const keptIds = new Set<number>();
    let checkedFailed = false;
    if (uncheckedCandidates.length > 0) {
      const relevanceResults = await filterRelevant(
        keyword,
        uncheckedCandidates.map(c => ({ id: c.id, title: c.title }))
      );

      if (relevanceResults === null) {
        checkedFailed = true;
      } else {
        relevanceResults.forEach(id => keptIds.add(id));

        const rowsToSave = uncheckedCandidates.map(c => ({
          keyword_id: keywordId,
          bill_id: c.id,
          similarity: c.similarity,
          llm_relevant: keptIds.has(c.id),
        }));

        await sql`
          insert into results ${sql(rowsToSave, "keyword_id", "bill_id", "similarity", "llm_relevant")}
          on conflict (keyword_id, bill_id) do update
            set similarity = excluded.similarity,
                llm_relevant = excluded.llm_relevant
        `;
      }
    }

    const shown = candidates.filter(c => c.llm_relevant === true || keptIds.has(c.id));

    const summaries = await Promise.all(
      shown.map(c => c.summary ?? getBillSummary(c.id))
    );

    const bills = shown.map((c, i) => ({
      id: c.id,
      identifier: c.identifier,
      title: c.title,
      similarity: c.similarity,
      summary: summaries[i],
      status: c.status,
      openstates_url: c.openstates_url,
    }));

    output.push({
      keyword,
      keywordId,
      bills,
      verified: !checkedFailed,
      unverified: checkedFailed
        ? uncheckedCandidates.map(c => ({
            identifier: c.identifier,
            title: c.title,
            similarity: c.similarity,
          }))
        : [],
    });
  }

  return NextResponse.json({ county: county.state_abbr, results: output });
}
