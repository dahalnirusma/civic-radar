import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getJustification } from "@/lib/justification";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const billId = Number(p.get("bill"));
  const keywordId = Number(p.get("keyword"));
  const countyFips = p.get("county") ?? "";

  if (!Number.isInteger(billId) || billId <= 0 ||
  !Number.isInteger(keywordId) || keywordId <= 0 ||
  !countyFips) {
return NextResponse.json({ error: "bill, keyword and county are required" }, { status: 400 });
}

  const [result] = await sql`select id from results where bill_id = ${billId} and keyword_id = ${keywordId} and llm_relevant = true`;
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const justification = await getJustification(result.id, countyFips);
  return NextResponse.json({ justification }); 
}