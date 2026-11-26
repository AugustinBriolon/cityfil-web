/** Team id of the Apple developer account that signs the iOS app. */
const APPLE_TEAM_ID = "6X5CP5SFAG";

/**
 * Universal links: with Cityfil installed, a shared score or invite link opens the app instead of this site.
 * iOS fetches this file over HTTPS, without redirects, and expects JSON.
 */
export function GET() {
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [`${APPLE_TEAM_ID}.run.cityfil.app`],
          components: [{ "/": "/share/*" }, { "/": "/invite/*" }],
        },
      ],
    },
  });
}
