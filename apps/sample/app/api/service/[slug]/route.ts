import { trace } from "@opentelemetry/api";
import { runService } from "../service";

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const data = await runService(request);
  return new Response(`Success ${params.slug} ${data}`, {
    status: 200,
  });
}
