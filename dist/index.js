export const registerOTel = (serviceName) => {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        return require("./register.node").registerOTel(serviceName);
    }
    // We don't initialize OTel in the browser/edge
    return;
};
//# sourceMappingURL=index.js.map