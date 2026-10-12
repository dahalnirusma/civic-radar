import { NextResponse } from "next/server";
import {sql} from "@/lib/db";

export async function GET() {
    const rows = await sql`SELECT count(*) FROM states`;
    return NextResponse.json({rows});
}