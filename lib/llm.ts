const model = "claude-haiku-5-5"
export async function askClaude({
    system,
    prompt,
    maxTokens = 300,
}:{
    system:string;
    prompt:string;
    maxTokens?:number;
}): Promise<string> {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
        throw new Error('CLAUDE_API_KEY is not defined.');
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [
                {role: 'user', content: prompt}],        
        }),
});
if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch Claude response ${res.statusText}: ${body}`);
}

const data = await res.json();
const block = data.content.find((c: {type:string}) => c.type === 'text');
return block ? block.text : '';
}
