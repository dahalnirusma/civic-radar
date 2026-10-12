import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { embed } from "@/lib/embeddings";

export async function GET(request: Request) {
  const keyword = new URL(request.url).searchParams.get("keyword");
  if (!keyword) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  const vec = await embed(keyword);
  const vecText = JSON.stringify(vec);
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit")) || 5, 25);

  const rows = await sql`
    select
      identifier,
      title,
      1 - (embedding <=> ${vecText}::vector) as similarity
    from bills
    where embedding is not null
    order by embedding <=> ${vecText}::vector
    limit ${limit}
  `;

  return NextResponse.json({ keyword, rows });
}