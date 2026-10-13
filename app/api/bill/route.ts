import { NextResponse } from "next/server";
import {sql} from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = Number(searchParams.get("id"));
  const keywordIds = (searchParams.get("keywords") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 5);

  if (!Number.isInteger(id) || id <= 0 || keywordIds.length === 0) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const [bill] = await sql`
    select id, identifier, title, summary, openstates_url
    from bills
    where id = ${id}
  `;
  if (!bill) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  const keywords = await sql`
    select id, name
    from keywords
    where id in ${sql(keywordIds)}
  `;
  if (keywords.length === 0) {
    return NextResponse.json({ error: "Keywords not found" }, { status: 404 });
  }

  // Keep the keywords in the same order as the URL
  keywords.sort((a, b) => keywordIds.indexOf(a.id) - keywordIds.indexOf(b.id));

  return NextResponse.json({ bill, keywords });
}