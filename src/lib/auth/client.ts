import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

/** Browser-side Better Auth client; baseURL defaults to the current origin (same-origin /api/auth). */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: "string", input: false },
        timezone: { type: "string", required: false },
        accent: { type: "string", input: false },
        countryCode: { type: "string", required: false, input: false },
        currency: { type: "string", required: false, input: false },
        locale: { type: "string", input: false },
        usage: { type: "string", required: false, input: false },
        onboardedAt: { type: "date", required: false, input: false },
      },
    }),
  ],
});
