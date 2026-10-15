import { z } from "zod";

/** What the page-view beacon posts (addendum §2 item 19): a root-relative app path, nothing else. */
export const PageViewBodySchema = z.object({
  path: z
    .string()
    .max(200)
    .regex(/^\/(?!\/)[^\s]*$/, "a root-relative path"),
});

export type PageViewBody = z.infer<typeof PageViewBodySchema>;
