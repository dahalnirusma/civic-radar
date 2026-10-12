export async function embed(text:string): Promise<number[]> {
    const [vector] = await embedMany([text]);
    return vector;
    
}

export async function embedMany(texts:string[]): Promise<number[][]>{
    const APIkey = process.env.OPEN_AI_API_KEY;
    if (!APIkey) {
        throw new Error('OPEN_AI_API_KEY is not defined.');
    }
    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${APIkey}`,
        },
        body: JSON.stringify({model: "text-embedding-3-small", input: texts}),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to fetch embeddings ${res.statusText}: ${body}`);
    }
    const data = await res.json();
    return data.data.sort((a:{index: number}, b:{index: number}) => a.index - b.index).map((item:{embedding: number[]}) => item.embedding);
}