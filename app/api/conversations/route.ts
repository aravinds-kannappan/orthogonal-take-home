import { NextRequest, NextResponse } from "next/server";
import { getAllConversations, createConversation, deleteConversation } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  return NextResponse.json(await getAllConversations());
}

export async function POST(req: NextRequest) {
  const { title } = await req.json().catch(() => ({ title: "New Conversation" }));
  const id = uuidv4();
  return NextResponse.json(await createConversation(id, title || "New Conversation"));
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await deleteConversation(id);
  return NextResponse.json({ success: true });
}
