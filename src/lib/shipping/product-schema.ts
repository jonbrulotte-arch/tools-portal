import { z } from "zod";

export const partNumberSchema = z.object({ partNumber: z.string().min(1, "Enter a part number").max(100) });

const inches = z.coerce.number().positive("Must be more than 0").max(165, "Over 165 in");

export const productQuoteSchema = z
  .object({
    partNumber: z.string().min(1).max(100),
    weight: z.coerce.number().positive("Enter the shipping weight").max(150, "Over 150 lb"),
    length: inches.nullable().optional(),
    width: inches.nullable().optional(),
    height: inches.nullable().optional(),
    origins: z.array(z.string().max(8)).min(1, "Pick at least one warehouse"),
    runId: z.string().max(40).nullable().optional(),
  })
  .superRefine((b, ctx) => {
    const given = [b.length, b.width, b.height].filter((v) => v != null).length;
    if (given > 0 && given < 3) ctx.addIssue({ code: "custom", path: ["length"], message: "Enter all three dimensions, or none" });
  });
