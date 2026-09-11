import { dispatchV1 } from "@/src/server/apiRouter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return dispatchV1(req);
}

export async function POST(req: Request) {
  return dispatchV1(req);
}

export async function PUT(req: Request) {
  return dispatchV1(req);
}

export async function PATCH(req: Request) {
  return dispatchV1(req);
}

export async function DELETE(req: Request) {
  return dispatchV1(req);
}
