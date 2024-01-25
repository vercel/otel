import type { Attributes } from "@opentelemetry/api";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { omitUndefinedAttributes } from "../util/attributes";
import { parseRequestId } from "../util/request-id";
import type { VercelRequestContext } from "./api";
import { getVercelRequestContext } from "./api";

/** @internal */
export function getVercelRequestContextAttributes(
  context: VercelRequestContext | undefined = getVercelRequestContext()
): Attributes | undefined {
  if (!context) {
    return undefined;
  }
  return omitUndefinedAttributes({
    [SemanticAttributes.HTTP_HOST]: context.headers.host,
    [SemanticAttributes.HTTP_USER_AGENT]: context.headers["user-agent"],
    "http.referer": context.headers.referer,

    "vercel.request_id": parseRequestId(context.headers["x-vercel-id"]),
    "vercel.matched_path": context.headers["x-matched-path"],
    "vercel.edge_region": context.headers["x-vercel-edge-region"],
  });
}
