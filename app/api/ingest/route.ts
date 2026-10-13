import { NextResponse } from "next/server";
import {sql} from "@/lib/db";

async function fetchBills(page:number, formattedDate: string, state: string) {
    const apiKey = process.env.OPEN_STATES_API_KEY;
    if (!apiKey) throw new Error("OPEN_STATES_API_KEY is not defined.");
    const params = new URLSearchParams({jurisdiction: state, updated_since: formattedDate, page: String(page)});
    params.append("include", "versions");
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
type ApiVersion = {
    note: string;
    links: { url: string; media_type: string }[];
  };

type APIBILL = {
    id: string,
    session: string,
    identifier: string,
    title: string,
    openstates_url: string,
    latest_action_date: string,
    updated_at: string,
    versions?: ApiVersion[],
    latest_action_description?: string,
    jurisdiction: {id: string}
}

function pickTextUrl(versions: ApiVersion[] | undefined): string | null {
    if (!versions || versions.length === 0) {
        return null;
    }
    const latest = versions?.at(-1);                 
    const link = latest?.links.find(l => l.media_type === "text/html");
    return link ? link.url : null;
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
        text_url: pickTextUrl(bill.versions),
        status: bill.latest_action_description || null,
        latest_action_date: bill.latest_action_date || null,
        source_updated_at: bill.updated_at,
    };
}
const max_pages = 2; // temp value, full 30 day run requires 11 pages
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(request: Request) {
    const state = new URL(request.url).searchParams.get('state');
    const [stateRow] = await sql`SELECT abbr, name from states where abbr = ${state}`;
    if (!stateRow) {
        return NextResponse.json({error: 'Invalid state'}, {status: 400});
    }
    const date = new Date();
    date.setDate(date.getDate() - 30);
    const formattedDate = date.toISOString().split('T')[0]; 
    const allBills = []
    const firstPage = await fetchBills(1, formattedDate, stateRow.name);
    allBills.push(...firstPage.results);
    const lastPage = Math.min(firstPage.pagination.max_page, max_pages);
    for (let page = 2; page <= lastPage; page++) {
        await sleep(6500);
        const data = await fetchBills(page, formattedDate, stateRow.name);
        allBills.push(...data.results);
    }
    const rows = allBills.map(toRow).filter((r): r is typeof r & {state: string} => r.state !== null);
    const uniqueRows = [...new Map(rows.map((r) => [r.external_id, r])).values()];
    if (uniqueRows.length > 0) {
        await sql `INSERT INTO bills ${sql(uniqueRows,
            'external_id', 'state', 'session', 'identifier', 'title', 'summary',
            'openstates_url', 'text_url', 'status', 'latest_action_date', 'source_updated_at')}
          ON CONFLICT (external_id) DO UPDATE SET
            title = EXCLUDED.title,
            summary = CASE WHEN bills.text_url IS DISTINCT FROM EXCLUDED.text_url
               THEN NULL ELSE bills.summary END,
            openstates_url = EXCLUDED.openstates_url,
            text_url = EXCLUDED.text_url,
            status = EXCLUDED.status,
            latest_action_date = EXCLUDED.latest_action_date,
            source_updated_at = EXCLUDED.source_updated_at`;
    }
    return NextResponse.json({fetched: allBills.length, saved: uniqueRows.length});

}