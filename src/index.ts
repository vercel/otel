export const registerOTel = (serviceName: string) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    return (
      require("./register.node") as typeof import("./register.node")
    ).registerOTel(serviceName);
  }
  // We don't initialize OTel in the browser/edge
  return;
};
