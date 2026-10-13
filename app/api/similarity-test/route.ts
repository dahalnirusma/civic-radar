import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getOrCreateKeyword } from "@/lib/keywords";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keyword = params.get("keyword");
  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }
  const limit = Math.min(Number(params.get("limit")) || 5, 25);

  const keywordId = await getOrCreateKeyword(keyword);

  const rows = await sql`
    select b.identifier, b.title, 1 - (b.embedding <=> k.embedding) as similarity
    from bills b, keywords k
    where k.id = ${keywordId} and b.embedding is not null
    order by b.embedding <=> k.embedding
    limit ${limit}
  `;

  return NextResponse.json({ keyword, keywordId, rows });
}