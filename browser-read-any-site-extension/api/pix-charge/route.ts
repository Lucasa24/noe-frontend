import { NextResponse } from "next/server";

type PixChargeBody = {
  extensionId?: string;
  recipientKey?: string;
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return jsonError("unauthorized", 401);
    }

    const body = await readJsonBody<PixChargeBody>(req);
    const extensionId = String(body.extensionId || "").trim();
    const recipientKey = String(body.recipientKey || "").trim();

    if (!extensionId || !recipientKey) {
      return jsonError("missing_parameters", 400);
    }

    const pushinPayToken = process.env.PUSHINPAY_TOKEN;

    if (!pushinPayToken) {
      return jsonError("missing_pushinpay_config", 500);
    }

    const response = await fetch("https://api.pushinpay.com.br/api/pix/cashIn", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pushinPayToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ value: 900 }),
    });

    if (!response.ok) {
      return jsonError("pix_charge_failed", response.status);
    }

    const data = await response.json();

    return jsonOk({
      transactionId: data.id,
      qrCode: data.qr_code,
      qrCodeBase64: data.qr_code_base64,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "pix_charge_failed", 500);
  }
}

function isAuthorized(req: Request) {
  const expectedToken = process.env.WEBHOOK_TOKEN || "";
  const providedToken = getBearerToken(req);

  return !expectedToken || providedToken === expectedToken;
}

function getBearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice("Bearer ".length).trim();
}

async function readJsonBody<T>(req: Request): Promise<T> {
  try {
    return await req.json();
  } catch (_error) {
    return {} as T;
  }
}

function jsonOk(payload: Record<string, unknown>) {
  return NextResponse.json(
    { ok: true, ...payload },
    { headers: getCorsHeaders() },
  );
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: getCorsHeaders() },
  );
}

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
