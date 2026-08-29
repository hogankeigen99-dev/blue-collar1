import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyValue } from "@/lib/auth";
import { exchangeSageCode } from "@/lib/accounting/sage-oauth";
import { storeSageTokens } from "@/lib/accounting/sage-tokens";
import { SAGE_STATE_COOKIE, type SageStatePayload } from "@/lib/accounting/sage-state";

function errorRedirect(request: Request, reason: string) {
  const url = new URL("/settings/integrations", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const store = await cookies();
  const stateCookie = store.get(SAGE_STATE_COOKIE)?.value;
  store.delete(SAGE_STATE_COOKIE); // single use, regardless of outcome below

  const flow = await verifyValue<SageStatePayload>(stateCookie);
  if (!flow) return errorRedirect(request, "sage_state_expired");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  if (!code || !returnedState || returnedState !== flow.state) {
    return errorRedirect(request, "sage_state_mismatch");
  }

  try {
    const tokens = await exchangeSageCode({ code, redirectUri: flow.redirectUri });
    await storeSageTokens(flow.companyId, tokens);
  } catch (err) {
    console.error("Sage Intacct connect failed:", err);
    return errorRedirect(request, "sage_connect_failed");
  }

  return NextResponse.redirect(new URL("/settings/integrations?connected=SAGE", request.url));
}
