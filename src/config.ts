import "dotenv/config";
import {
  createAppConfig,
  getRuntimeConfig,
  type AppConfig,
  type RuntimeEnv,
} from "./runtime.js";

export { createAppConfig, type AppConfig, type RuntimeEnv };

export const config = new Proxy({} as AppConfig, {
  get(_target, property: keyof AppConfig) {
    return getRuntimeConfig()[property];
  },
});
