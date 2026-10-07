// Test-only: `server-only` throws outside the Next.js server runtime. The DAL
// imports it as a guard, which is correct in the app but blocks a plain tsx
// script from verifying the data layer. Map it to an empty module.
const Module = require("module");
const original = Module._load;
Module._load = function (request, ...rest) {
  if (request === "server-only" || request.endsWith("/server-only")) return {};
  return original.call(this, request, ...rest);
};