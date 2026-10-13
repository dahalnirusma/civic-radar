import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const billId = Number(body.bill);
  const keywordId = Number(body.keyword);
  const score = Number(body.vote); // 1 = relevant, -1 = not relevant
  const voterId = String(body.voter ?? "");

  if (
    !Number.isInteger(billId) || billId <= 0 ||
    !Number.isInteger(keywordId) || keywordId <= 0 ||
    (score !== 1 && score !== -1) ||
    !UUID.test(voterId)
  ) {
    return NextResponse.json({ error: "bill, keyword, vote and voter are required" }, { status: 400 });
  }

  const [result] = await sql`
    select id from results
    where bill_id = ${billId} and keyword_id = ${keywordId} and llm_relevant = true
  `;
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await sql`
    insert into feedback (result_id, voter_id, score)
    values (${result.id}, ${voterId}, ${score})
    on conflict (result_id, voter_id) do update
      set score = excluded.score, updated_at = now()
  `;

  return NextResponse.json({ ok: true });
}