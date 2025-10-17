import { getVercelRequestContext } from "./api";

export function isDraining(): boolean {
  const context = getVercelRequestContext();
  return Boolean(context?.telemetry?.traceDrains?.length);
}
