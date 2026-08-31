const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-1.5-flash";
const PROMPT = `Você é o auditor de viral BR da OFM Vault Pro.

TAREFA: Classifique esses 20 comentários de um reel.

REGRAS ADAPTADAS BR:
- "beautiful baby / nice / ❤️🔥 / linda / perfeita" genérico = spam, não conta
- Frase real com opinião/piada = ouro, MAS se for gringo (inglês/espanhol) conta como RUIM mesmo sendo real (público gringo não compra no BR)
- 40-50% de comentários gringos = REPROVAR, mesmo que o vídeo seja 2.6x outlier
- Você SÓ classifica comentários. NÃO avalie views/comments (isso já foi filtrado)

RETORNE SÓ JSON:
{
  "real_pct": 0-100,
  "generic_pct": 0-100,
  "br_pct": 0-100,
  "gringo_pct": 0-100,
  "main_language": "pt-BR / en / es",
  "veredito": "APROVADO" | "REPROVADO",
  "motivo_curto": "1 frase em pt-br"
}

VEREDITO = APROVADO só se real_pct >=60 E gringo_pct <40. Se gringo_pct >=40, REPROVADO mesmo com frase real.`;

export type AIResult = {
  real_pct: number;
  generic_pct: number;
  br_pct: number;
  gringo_pct: number;
  main_language: string;
  veredito: "APROVADO" | "REPROVADO";
  motivo_curto: string;
};

export async function classifyComments(comments: string[]): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    // Fallback heurístico quando sem chave (para não travar o fluxo)
    return heuristicClassify(comments);
  }

  const body = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          { text: `COMENTÁRIOS:\n${comments.map((c, i) => `${i + 1}. ${c}`).join("\n")}` },
        ],
      },
    ],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 300)}`);
  }

  const json: any = await resp.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    // Gemini com responseMimeType json já retorna JSON string
    const parsed = JSON.parse(text);
    return normalizeAIResult(parsed);
  } catch {
    // tenta extrair JSON de dentro do texto
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return normalizeAIResult(JSON.parse(match[0]));
      } catch {}
    }
    throw new Error(`Resposta IA inválida: ${text.slice(0, 300)}`);
  }
}

function normalizeAIResult(r: any): AIResult {
  return {
    real_pct: Math.max(0, Math.min(100, Number(r.real_pct) || 0)),
    generic_pct: Math.max(0, Math.min(100, Number(r.generic_pct) || 0)),
    br_pct: Math.max(0, Math.min(100, Number(r.br_pct) || 0)),
    gringo_pct: Math.max(0, Math.min(100, Number(r.gringo_pct) || 0)),
    main_language: String(r.main_language ?? "pt-BR"),
    veredito: r.veredito === "APROVADO" ? "APROVADO" : "REPROVADO",
    motivo_curto: String(r.motivo_curto ?? "").slice(0, 120),
  };
}

function heuristicClassify(comments: string[]): AIResult {
  if (comments.length === 0) return { real_pct: 0, generic_pct: 100, br_pct: 0, gringo_pct: 100, main_language: "unknown", veredito: "REPROVADO", motivo_curto: "Sem comentários" };
  const genericRegex = /beautiful baby|nice|❤️|🔥|linda|perfeita|gata|top/i;
  let generic = 0;
  let gringo = 0;
  for (const c of comments) {
    if (genericRegex.test(c) || c.trim().split(/\s+/).length < 3) generic++;
    if (/[a-z]/i.test(c) && /^(the|you|are|is|my|love|nice|so|very|beautiful)/i.test(c.trim())) gringo++;
  }
  const generic_pct = Math.round((generic / comments.length) * 100);
  const gringo_pct = Math.round((gringo / comments.length) * 100);
  const real_pct = 100 - generic_pct;
  const br_pct = 100 - gringo_pct;
  const veredito = real_pct >= 60 && gringo_pct < 40 ? "APROVADO" : "REPROVADO";
  return { real_pct, generic_pct, br_pct, gringo_pct, main_language: gringo_pct > 50 ? "en" : "pt-BR", veredito, motivo_curto: `Heurística: ${real_pct}% real, ${gringo_pct}% gringo` };
}
