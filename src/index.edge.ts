import { NextApiHandler } from "next";

export const registerOTel = (serviceName: string) => {
  // We don't support OTel on edge yet
  void serviceName;
};

export const traceWithOTel = (originalHandler: NextApiHandler) => {
  // Make no changes to handler in edge
  return originalHandler;
};
