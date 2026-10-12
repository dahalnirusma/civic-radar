import { NextResponse } from "next/server";
import {sql} from "@/lib/db";

const min_county_share = 0.10;
export async function GET(request: Request) {
    const zip = new URL(request.url).searchParams.get('zip');
    if (!zip || !/^\d{5}$/.test(zip)) {
        return NextResponse.json({error: 'Invalid zip code'}, {status: 400});
    }
    const rows = await sql`with ranked as (
        select
          z.zip,
          c.fips as county_fips,
          c.name as county_name,
          c.state_abbr,
          z.overlap_land_area::numeric
            / nullif(sum(z.overlap_land_area) over (partition by z.zip), 0) as share,
          row_number() over (
            partition by z.zip
            order by z.overlap_land_area desc, c.fips
          ) as rnk
        from zip_codes z
        join counties c on c.fips = z.county_fips
        where z.zip = ${zip}
      )
      select zip, county_fips, county_name, state_abbr, round(share, 3)::float as share
      from ranked
      where share >= ${min_county_share} or rnk = 1
      order by share desc`;

    if (rows.length === 0) {
        return NextResponse.json({error: 'Zip code not found'}, {status: 404});
    }
    return NextResponse.json({rows});
}