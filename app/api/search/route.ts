import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getOrCreateKeyword } from "@/lib/keywords";
import { filterRelevant } from "@/lib/relevance";

const Min_simarity = 0.2;
const Top_N = 10;
const Recent_Days = 60; 
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

  const output = [];

  for (const keyword of keywords) {
    const keywordId = await getOrCreateKeyword(keyword);

    const candidates = await sql`
      select b.id, b.identifier, b.title, b.latest_action_date,
             (1 - (b.embedding <=> k.embedding))::float as similarity,
             r.llm_relevant
      from bills b
      join keywords k on k.id = ${keywordId}
      left join results r on r.bill_id = b.id and r.keyword_id = k.id
      where b.embedding is not null
        and b.state = ${county.state_abbr}
        and b.latest_action_date >= current_date - ${Recent_Days}::int
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

    const bills = candidates
      .filter(c => c.llm_relevant === true || keptIds.has(c.id))
      .map(c => ({
        identifier: c.identifier,
        title: c.title,
        similarity: c.similarity,
      }));

    output.push({
      keyword,
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
