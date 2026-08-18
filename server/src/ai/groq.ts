import "../env";
import type { AiAdapter } from "./types";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not set.");
}

const apiKey = process.env.GROQ_API_KEY;

// openai/gpt-oss-120b: strong Thai fluency among Groq's free-tier models,
// and separates its chain-of-thought into a distinct `reasoning` field on
// the response so `message.content` is already the clean final answer.
const MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `คุณเป็นผู้ช่วยตอบคำถามเกี่ยวกับเนื้อหาในหนังสือเล่มหนึ่งเท่านั้น

กฎเคร่งครัดที่ต้องทำตามทุกครั้ง:
1. ตอบโดยอ้างอิงจาก "เนื้อหาจากหนังสือ" ที่ให้มาเท่านั้น ห้ามใช้ความรู้ภายนอกหรือคาดเดาข้อมูลที่ไม่มีในเนื้อหา
2. ถ้าเนื้อหาที่ให้มาไม่มีคำตอบของคำถามนี้ ให้ตอบว่า "ไม่พบข้อมูลนี้ในเล่มนี้" เท่านั้น ห้ามแต่งคำตอบขึ้นเอง
3. ตอบเป็นภาษาไทย กระชับ เข้าใจง่าย ไม่เกิน 4-5 ประโยค`;

interface GroqChatResponse {
  choices?: { message?: { content?: string } }[];
}

export const groqAiAdapter: AiAdapter = {
  async answerFromContext(question, context) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `เนื้อหาจากหนังสือ:\n"""\n${context}\n"""\n\nคำถาม: ${question}` },
        ],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GROQ_REQUEST_FAILED (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as GroqChatResponse;
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("GROQ_EMPTY_RESPONSE");
    return answer;
  },
};
