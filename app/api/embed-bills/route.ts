import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import { embedMany } from "@/lib/embeddings";
import { isAuthorized } from "@/lib/auth";

const BATCH_SIZE = 100;
export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const bills = await sql`SELECT id, title from bills where embedding IS NULL LIMIT ${BATCH_SIZE}`;
    if (bills.length === 0) {
        return NextResponse.json({embeddings: 0});
    }
    const texts = bills.map((b)=> b.title);
    const vectors = await embedMany(texts);
    for (let i = 0; i < bills.length; i++) {
        const bill = bills[i];
        const vector = vectors[i];
        await sql`UPDATE bills SET embedding = ${JSON.stringify(vector)}::vector WHERE id = ${bill.id}`;
    }
    return NextResponse.json({embedded: bills.length});
}