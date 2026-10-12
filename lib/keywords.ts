import {sql} from "@/lib/db";
import {embed} from "@/lib/embeddings";

export function normalizeKeyword(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function getOrCreateKeyword(raw: string): Promise<number>{
    const normalized = normalizeKeyword(raw);
    if (!normalized) throw new Error('Keyword cannot be empty');
    const [existing] = await sql`SELECT id FROM keywords WHERE name = ${normalized} and embedding IS NOT NULL`;
    if (existing) {
        return existing.id;
    }
    const embedding = await embed(normalized);
    const [result] = await sql`INSERT INTO keywords (name, embedding) VALUES (${normalized}, ${JSON.stringify(embedding)}::vector) 
    on conflict (name) do update set embedding = excluded.embedding
    RETURNING id`;
    return result.id;
}