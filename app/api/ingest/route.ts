import { NextResponse } from "next/server";
import {sql} from "@/lib/db";

async function fetchBills(page:number, formattedDate: string) {
    const apiKey = process.env.OPEN_STATES_API_KEY;
    if (!apiKey) throw new Error("OPEN_STATES_API_KEY is not defined.");
    const params = new URLSearchParams({jurisdiction: "Virginia", updated_since: formattedDate, page: String(page),});
    const res = await fetch(`https://v3.openstates.org/bills?${params}`, {
        headers: {"x-api-key": apiKey},
    });
    if (!res.ok){
        const body = await res.text();
        const retryAttempt = res.headers.get("retry-after");
        throw new Error(`Failed to fetch bills ${res.statusText}: ${body}. Retry after: ${retryAttempt}`);
    }
    return res.json();
}
type APIBILL = {
    id: string,
    session: string,
    identifier: string,
    title: string,
    openstates_url: string,
    latest_action_date: string,
    updated_at: string,
    jurisdiction: {id: string}
}
function toRow(bill:APIBILL){
    return {
        external_id: bill.id,
        state: bill.jurisdiction.id.match(/state:([a-z]{2})/)?.[1]?.toUpperCase() ?? null,
        session: bill.session,
        identifier: bill.identifier,
        title: bill.title,
        summary: null,
        openstates_url: bill.openstates_url,
        latest_action_date: bill.latest_action_date || null,
        source_updated_at: bill.updated_at,
    };
}
const max_pages = 2; // temp value, full 30 day run requires 11 pages
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET() {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    const formattedDate = date.toISOString().split('T')[0]; 
    const allBills = []
    const firstPage = await fetchBills(1, formattedDate);
    allBills.push(...firstPage.results);
    const lastPage = Math.min(firstPage.pagination.max_page, max_pages);
    for (let page = 2; page <= lastPage; page++) {
        await sleep(6500);
        const data = await fetchBills(page, formattedDate);
        allBills.push(...data.results);
    }
    const rows = allBills.map(toRow).filter((r): r is typeof r & {state: string} => r.state !== null);
    const uniqueRows = [...new Map(rows.map((r) => [r.external_id, r])).values()];
    if (uniqueRows.length > 0) {
        await sql `INSERT INTO bills ${sql(uniqueRows, 'external_id', 'state', 'session', 'identifier', 'title', 
        'summary', 'openstates_url', 'latest_action_date', 'source_updated_at')} 
        ON CONFLICT (external_id) DO UPDATE SET title = EXCLUDED.title, 
         openstates_url = EXCLUDED.openstates_url, 
        latest_action_date = EXCLUDED.latest_action_date, source_updated_at = EXCLUDED.source_updated_at`;
    }
    return NextResponse.json({fetched: allBills.length, saved: uniqueRows.length});

}