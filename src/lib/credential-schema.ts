import { z } from "zod";

export const credentialBodySchema = z.object({
  apiKey: z
    .string()
    .min(10, "That doesn't look like an API key")
    .max(1000)
    .regex(/^\S+$/, "API keys can't contain spaces"),
});
