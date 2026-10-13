import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getOrCreateKeyword } from "@/lib/keywords";
import { filterRelevant } from "@/lib/relevance";

// TEMPORARY: public and spends API credits. Delete once the real search route works.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 8), 25);

  if (!keyword.trim()) {
    return NextResponse.json({ error: "keyword required" }, { status: 400 });
  }

  const keywordId = await getOrCreateKeyword(keyword);

  const rows = await sql`
    select b.id, b.identifier, b.title,
           round((1 - (b.embedding <=> k.embedding))::numeric, 3)::float as similarity
    from bills b, keywords k
    where k.id = ${keywordId} and b.embedding is not null
    order by b.embedding <=> k.embedding
    limit ${limit}
  `;

  const candidates = rows.map(r => ({ id: r.id as number, title: r.title as string }));
  const keptIds = await filterRelevant(keyword, candidates);

  return NextResponse.json({
    keyword,
    checked: keptIds !== null, // false means the reply was unusable, not "nothing relevant"
    keptCount: keptIds?.length ?? null,
    rows: rows.map(r => ({
      identifier: r.identifier,
      title: r.title,
      similarity: r.similarity,
      kept: keptIds === null ? null : keptIds.includes(r.id),
    })),
  });
}