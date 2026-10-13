import * as cheerio from "cheerio";

const MAX_CHARS = 4000; 

export async function fetchBillText(url: string): Promise<string | null> {
    let html: string;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      html = await res.text();
    } catch (err) {
      console.error("fetchBillText failed:", err);
      return null;
    }
  
    const $ = cheerio.load(html);
  
    $("em.new").each((_, el) => {
      const t = $(el).text().trim();
      if (!t) return;
      $(el).replaceWith($("<span></span>").text(` {+${t}+} `));
    });
  
    $("s").each((_, el) => {
      const t = $(el).text().trim();
      if (!t) return;
      $(el).replaceWith($("<span></span>").text(` [-${t}-] `));
    });
  
    const lines: string[] = $("p")
      .map((_, p) =>
        $(p).text().replace(/\s+/g, " ").trim()
          .replace(/\+\}\s*\{\+/g, " ")
          .replace(/-\]\s*\[-/g, " ")
      )
      .get()
      .filter(Boolean);
  
    const hasChange = (l: string) => l.includes("{+") || l.includes("[-");
    const isSectionHeading = (l: string) => /^§+\s*[\d.:\-]+\./.test(l);
  
    const keep = lines.some(hasChange)
      ? lines.filter((l, i) => i < 12 || isSectionHeading(l) || hasChange(l))
      : lines;
  
    let text = keep.join("\n");
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + "\n[TEXT TRUNCATED]";
    }
    return text;
  }