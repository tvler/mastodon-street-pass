import { ProfileData, Webfinger } from "./constants";
import { getIsUrlHttpOrHttps } from "./getIsUrlHttpOrHttps";
import { removeSubstring } from "./removeSubstring";

export async function getUncachedProfileData(
  href: string,
): Promise<Required<ProfileData>> {
  try {
    // TODO: Add path for Bluesky
    if (!getIsUrlHttpOrHttps(href)) {
      throw new Error();
    }

    if (href.startsWith("https://twitter.com")) {
      throw new Error();
    }

    if (href.startsWith("https://instagram.com")) {
      throw new Error();
    }

    if (href.startsWith("https://github.com")) {
      throw new Error();
    }

    if (href.startsWith("https://bsky.app/profile")) {
      const subjectAccount = removeSubstring(href, "https://bsky.app/profile/", 0);
      const actor = subjectAccount.match ? subjectAccount.value : undefined

      if (!actor) {
        throw new Error();
      }

      const getProfileUrl = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${actor}`

      const getProfileResp = await fetch(getProfileUrl);
      const profile = await getProfileResp.json()

      return {
        type: "profile",
        account: actor + "@bsky.app",
        profileUrl: href,
        avatar: profile.avatar,
      };
    } else {
      const visitedHrefResp = await fetch(href);
      if (!visitedHrefResp.ok) {
        throw new Error();
      }

      const visitedUrl = new URL(visitedHrefResp.url);

      const webfingerUrl = new URL(visitedUrl.origin);
      webfingerUrl.pathname = ".well-known/webfinger";
      webfingerUrl.searchParams.set("resource", visitedUrl.toString());

      const webfingerResp = await fetch(webfingerUrl);
      if (!webfingerResp.ok) {
        throw new Error();
      }

      const webfinger: Webfinger = await webfingerResp.json();

      /**
       * Account (username) of profile
       */
      let account: string | undefined;
      {
        const subjectAccount = removeSubstring(webfinger.subject, "acct:", 0);
        if (subjectAccount.match) {
          account = subjectAccount.value;
        }
      }

      let profileUrl: string | undefined;
      let avatar: string | undefined;
      for (const webfingerLink of webfinger.links ?? []) {
        if (!webfingerLink.href) {
          continue;
        }
        switch (webfingerLink.rel) {
          case "http://webfinger.net/rel/profile-page": {
            try {
              profileUrl = new URL(webfingerLink.href).toString();
            } catch (err) {
              // Do nothing
            }
            break;
          }
          case "http://webfinger.net/rel/avatar": {
            try {
              avatar = new URL(webfingerLink.href).toString();
            } catch (err) {
              // Do nothing
            }
            break;
          }
        }
      }

      if (!profileUrl) {
        throw new Error();
      }
  
      return {
        type: "profile",
        account,
        profileUrl,
        avatar,
      };
    }
  } catch (err) {
    return { type: "notProfile" };
  }
}
