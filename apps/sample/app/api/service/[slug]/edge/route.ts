import { runService } from "../../service";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const data = await runService(request);
  return new Response(`Success edge ${params.slug} ${data}`, {
    status: 200,
  });
}
