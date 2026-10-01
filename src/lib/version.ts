import pkg from "../../package.json" with { type: "json" };

/** The app version from package.json; recorded on exports and backups. */
export const APP_VERSION: string = typeof pkg.version === "string" ? pkg.version : "0.0.0";
