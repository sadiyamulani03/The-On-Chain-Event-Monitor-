import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";

// In-memory store for demo - keyed by Privy DID (subject from verified token)
const stampStore = globalThis.__stampStore || (globalThis.__stampStore = new Map());

function getPrivyClient() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing Privy environment variables");
  }
  return new PrivyClient(appId, appSecret);
}

export async function POST(request) {
  // 5. The award endpoint verifies the Privy access token server-side
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "")?.trim();

  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }

  let verifiedClaims;
  try {
    const privy = getPrivyClient();
    verifiedClaims = await privy.verifyAuthToken(token);
  } catch (e) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  // 6. The stamped identity comes from the verified token claims
  const userId = verifiedClaims.userId;
  if (!userId) {
    return NextResponse.json({ error: "Token missing user identity" }, { status: 401 });
  }

  // Do NOT trust any identifier from the request body - derive solely from verified token
  // Perform write only AFTER verification succeeds

  const current = stampStore.get(userId) || 0;
  const next = Math.min(current + 1, 10);
  stampStore.set(userId, next);

  return NextResponse.json({ stamps: next, userId });
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 401 });
  }
  try {
    const privy = getPrivyClient();
    const verifiedClaims = await privy.verifyAuthToken(token);
    const userId = verifiedClaims.userId;
    const stamps = stampStore.get(userId) || 0;
    return NextResponse.json({ stamps, userId });
  } catch (e) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}
