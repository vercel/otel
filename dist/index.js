export * as api from "@opentelemetry/api";
export let registerOTel;
// It would be better to do this split using `exports` in package.json (for better tree-shaking),
// but I wasn't able to get it to work
if (process.env.NEXT_RUNTIME === "nodejs") {
    registerOTel = (serviceName) => {
        return require("./register.node").registerOTel(serviceName);
    };
}
else {
    registerOTel = (serviceName) => {
        // We don't initialize OTel in the browser/edge
        void serviceName;
        return undefined;
    };
}
//# sourceMappingURL=index.js.map