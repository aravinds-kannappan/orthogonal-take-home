import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getConversation, createConversation, addMessage, updateConversationSummary, MAX_MESSAGES_IN_CONTEXT } from "@/lib/db";
import { CLAUDE_TOOLS, orthogonalTools, ToolName } from "@/lib/orthogonal";
import { v4 as uuidv4 } from "uuid";

const anthropic = new Anthropic({ apiKey: process.env.Anthropic! });

const SYSTEM_PROMPT = `You are a professional research assistant with access to real business intelligence APIs via Orthogonal.

RULES:
- Use your tools to gather real data
- After ALL tool calls are complete, write ONE clean final response
- Start with a brief 1-line summary of what you did e.g. "I searched Apollo and found 10 contacts at Stripe."
- Then present the results in clean markdown: **bold** names, bullet points for data fields
- Do NOT output chain-of-thought mid-response like "let me try...", "I'll now search...", "Let me broaden..."
- For multi-part requests, call ALL relevant tools before writing your response — do not stop after the first result
- Chain tools when needed: if asked to find contacts AND their emails, call find_contacts_at_company then find_email for each person in the same session
- If find_email fails, automatically call enrich_person for the same person — it also returns email and LinkedIn URL
- Only tell the user a lookup failed if ALL available tools for that data have been tried
- End with one short follow-up offer e.g. "Would you like me to enrich any of these contacts?"`;

async function executeTool(name: ToolName, input: Record<string, unknown>) {
  switch (name) {
    case "search_people": return orthogonalTools.searchPeople(input as Parameters<typeof orthogonalTools.searchPeople>[0]);
    case "search_companies": return orthogonalTools.searchCompanies(input as Parameters<typeof orthogonalTools.searchCompanies>[0]);
    case "enrich_person": return orthogonalTools.enrichPerson(input as Parameters<typeof orthogonalTools.enrichPerson>[0]);
    case "find_email": return orthogonalTools.findEmail(input as Parameters<typeof orthogonalTools.findEmail>[0]);
    case "enrich_company": return orthogonalTools.enrichCompany(input as Parameters<typeof orthogonalTools.enrichCompany>[0]);
    case "find_contacts_at_company": return orthogonalTools.findContactsAtCompany(input as Parameters<typeof orthogonalTools.findContactsAtCompany>[0]);
    case "search_people_nl": return orthogonalTools.searchPeopleNL(input as Parameters<typeof orthogonalTools.searchPeopleNL>[0]);
    default: return { success: false, error: `Unknown tool: ${name}` };
  }
}

async function buildContextMessages(convId: string): Promise<Anthropic.MessageParam[]> {
  const conv = await getConversation(convId);
  if (!conv) return [];
  const msgs = conv.messages.slice(-MAX_MESSAGES_IN_CONTEXT);
  const result: Anthropic.MessageParam[] = [];
  if (conv.summary && conv.messages.length > MAX_MESSAGES_IN_CONTEXT) {
    result.push({ role: "user", content: `[Previous conversation summary: ${conv.summary}]` });
    result.push({ role: "assistant", content: "Understood, I have the context from before." });
  }
  for (const m of msgs) result.push({ role: m.role, content: m.content });
  return result;
}

async function summarizeIfNeeded(convId: string) {
  const conv = await getConversation(convId);
  if (!conv || conv.messages.length < MAX_MESSAGES_IN_CONTEXT) return;
  const old = conv.messages.slice(0, -MAX_MESSAGES_IN_CONTEXT);
  if (!old.length) return;
  try {
    const r = await anthropic.messages.create({
      model: "claude-sonnet-4-5", max_tokens: 400,
      messages: [{ role: "user", content: `Summarize in 2-3 sentences:\n\n${old.map(m => `${m.role}: ${m.content}`).join("\n")}` }],
    });
    const summary = r.content[0].type === "text" ? r.content[0].text : "";
    await updateConversationSummary(convId, summary);
  } catch { /* non-fatal */ }
}

export async function POST(req: NextRequest) {
  try {
    const { conversationId, message } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

    let convId = conversationId;
    if (!convId || !(await getConversation(convId))) {
      convId = convId || uuidv4();
      await createConversation(convId, "New Conversation");
    }

    await addMessage(convId, { id: uuidv4(), role: "user", content: message, createdAt: new Date().toISOString() });
    await summarizeIfNeeded(convId);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        try {
          send({ type: "conversation_id", conversationId: convId });
          let currentMessages = await buildContextMessages(convId);
          let finalText = "";
          let iterations = 0;

          while (iterations++ < 8) {
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-5",
              max_tokens: 2048,
              system: SYSTEM_PROMPT,
              tools: CLAUDE_TOOLS as unknown as Anthropic.Tool[],
              messages: currentMessages,
            });

            for (const block of response.content) {
              if (block.type === "text") { finalText += block.text; send({ type: "text", text: block.text }); }
            }

            if (response.stop_reason !== "tool_use") break;

            const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
              response.content
                .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
                .map(async (block) => {
                  send({ type: "tool_start", toolName: block.name, toolInput: block.input });
                  const result = await executeTool(block.name as ToolName, block.input as Record<string, unknown>);
                  send({ type: "tool_result", toolName: block.name, result, price: result.price });
                  return { type: "tool_result" as const, tool_use_id: block.id, content: JSON.stringify(result) };
                })
            );

            currentMessages = [...currentMessages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
            finalText = "";
          }

          await addMessage(convId, { id: uuidv4(), role: "assistant", content: finalText, createdAt: new Date().toISOString() });
          send({ type: "done" });
          controller.close();
        } catch (err) {
          send({ type: "error", error: String(err) });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
