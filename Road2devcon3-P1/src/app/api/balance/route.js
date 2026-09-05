import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";

const stampStore = globalThis.__stampStore || (globalThis.__stampStore = new Map());

function getPrivyClient() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing Privy environment variables");
  }
  return new PrivyClient(appId, appSecret);
}

export async function GET(request) {
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

  const userId = verifiedClaims.userId;
  if (!userId) {
    return NextResponse.json({ error: "Token missing user identity" }, { status: 401 });
  }

  const stamps = stampStore.get(userId) || 0;
  return NextResponse.json({ stamps, userId });
}
