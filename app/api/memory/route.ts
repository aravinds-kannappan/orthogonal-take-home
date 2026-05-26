import { NextResponse } from "next/server";
import { getMemories } from "@/lib/memory";

export async function GET() {
  const memories = await getMemories();
  return NextResponse.json({ count: memories.length, memories });
}
