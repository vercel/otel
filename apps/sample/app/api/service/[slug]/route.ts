import { runService } from "../service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const http = await import('node:http')
  const data = await runService(request, http);
  return new Response(`Success ${params.slug} ${data}`, {
    status: 200,
  });
}
