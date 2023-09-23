import type { DeepReadonly } from "ts-essentials";
import { z } from "zod";

/**
 * =========
 * CONSTANTS
 * =========
 */

export const Message = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("HREF_PAYLOAD"),
    args: z.object({
      relMeHref: z.string(),
      tabUrl: z.string(),
    }),
  }),
  z.object({
    name: z.literal("FETCH_PROFILE_UPDATE"),
    args: z.object({
      relMeHref: z.string(),
    }),
  }),
]);

export const MessageReturn = {
  HREF_PAYLOAD: z.void(),
  FETCH_PROFILE_UPDATE: z.promise(z.boolean()),
} satisfies Record<Message["name"], unknown>;

export type Message = z.infer<typeof Message>;

type ArgMap = {
  [Key in Message["name"]]: Extract<Message, { name: Key }>["args"];
};

export const messageCallbacks: {
  [K in keyof ArgMap]: (value: ArgMap[K]) => z.infer<(typeof MessageReturn)[K]>;
} = {
  async HREF_PAYLOAD(args) {
    const hasExistingHrefData = (
      await getHrefStore((prev) => {
        const hrefStore = new Map(prev);
        for (const [key, hrefData] of hrefStore) {
          if (
            hrefData.profileData.type === "notProfile" &&
            hrefData.viewedAt + timeToExpireNotProfile < Date.now()
          ) {
            hrefStore.delete(key);
          }
        }

        return hrefStore;
      })
    ).has(args.relMeHref);

    if (hasExistingHrefData) {
      return;
    }

    const profileData = await getUncachedProfileData(args.relMeHref);

    await getHrefStore((hrefStore) => {
      const newHrefStore = new Map(hrefStore);
      newHrefStore.set(args.relMeHref, {
        profileData: profileData,
        viewedAt: Date.now(),
        websiteUrl: args.tabUrl,
        relMeHref: args.relMeHref,
      });

      return newHrefStore;
    });
  },
  async FETCH_PROFILE_UPDATE(args): Promise<boolean> {
    try {
      new URL(args.relMeHref);
    } catch (err) {
      return false;
    }

    const hasExistingHrefData = (await getHrefStore()).has(args.relMeHref);
    if (!hasExistingHrefData) {
      return false;
    }

    const profileData = await getUncachedProfileData(args.relMeHref);
    if (profileData.type === "notProfile") {
      return false;
    }
    await getHrefStore();

    return true;
  },
};

/**
 * Thanks to https://stackoverflow.com/questions/70598583/argument-of-type-string-number-is-not-assignable-to-parameter-of-type-never
 * And https://github.com/Microsoft/TypeScript/issues/30581#issuecomment-1008338350
 * todo look at https://github.com/Microsoft/TypeScript/issues/30581#issuecomment-1080979994
 */
export function runMessageCallback<K extends keyof ArgMap>(
  message: { [P in K]: { name: P; args: ArgMap[P] } }[K],
): z.infer<(typeof MessageReturn)[K]> {
  return messageCallbacks[message.name](message.args);
}

export type Target = "chrome" | "firefox" | "safari";

type Profile = { type: "profile"; profileUrl: string };

type NotProfile = { type: "notProfile" };

type ProfileData = Profile | NotProfile;

type NotNullNotUndefined = {};

type HrefData = {
  profileData: ProfileData;
  websiteUrl: string;
  viewedAt: number;
  relMeHref: string;
  updatedAt?: number;
};

export type HrefStore = Map<string, HrefData>;

type Webfinger = {
  subject: string;
  aliases?: Array<string>;
  properties?: Record<string, string>;
  links?: Array<{
    rel: string;
    type?: string;
    href?: string;
    titles?: Record<string, string>;
    properties?: Record<string, string>;
  }>;
};

export const actionInactive = {
  "16": "/action-inactive-16.png",
  "19": "/action-inactive-19.png",
  "32": "/action-inactive-32.png",
  "38": "/action-inactive-38.png",
} as const satisfies Record<string, string>;

export const actionActive = {
  "16": "/action-active-16.png",
  "19": "/action-active-19.png",
  "32": "/action-active-32.png",
  "38": "/action-active-38.png",
} as const satisfies Record<string, string>;

export const timeToExpireNotProfile = 10 * 60 * 1000; // 10 min in milliseconds

export type MapValue<T> = T extends Map<any, infer V> ? V : never;

/**
 * =====
 * UTILS
 * =====
 */

export function getIsUrlHttpOrHttps(uncheckedUrl: string | undefined): boolean {
  if (!uncheckedUrl) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(uncheckedUrl);
  } catch (err) {
    return false;
  }

  return url.protocol === "http:" || url.protocol === "https:";
}

export function getProfiles(
  hrefStore: DeepReadonly<HrefStore>,
): Map<string, { profileData: Profile } & HrefData> {
  const profiles: Map<string, { profileData: Profile } & HrefData> = new Map();

  for (const hrefData of Array.from(hrefStore.values()).reverse()) {
    if (hrefData.profileData.type !== "profile") {
      continue;
    }
    profiles.set(hrefData.profileData.profileUrl, {
      profileData: {
        type: hrefData.profileData.type,
        profileUrl: hrefData.profileData.profileUrl,
      },
      websiteUrl: hrefData.websiteUrl,
      viewedAt: hrefData.viewedAt,
      relMeHref: hrefData.relMeHref,
    });
  }

  return profiles;
}

function getIsRelWebfingerProfilePageRel(href: string) {
  const webFingerProfilePageRelWithoutProtocol =
    "//webfinger.net/rel/profile-page";

  return (
    href === `http:${webFingerProfilePageRelWithoutProtocol}` ||
    href === `https:${webFingerProfilePageRelWithoutProtocol}`
  );
}

function constructOpenIDUrl(visitedRelMeUrl: URL) {
  const webfingerHost = visitedRelMeUrl.hostname;
  const accountName = visitedRelMeUrl.pathname.replace("/", "");

  const webfingerUrl = new URL(visitedRelMeUrl.origin);
  webfingerUrl.pathname = ".well-known/webfinger";

  if (!accountName || !webfingerHost) {
    throw new Error();
  }

  webfingerUrl.searchParams.set(
    "resource",
    `acct:@${accountName}@${webfingerHost}`
  );

  return webfingerUrl;
}

export async function getUncachedProfileData(
  href: string,
): Promise<ProfileData> {
  try {
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

    const visitedHrefResp = await fetch(href);
    if (!visitedHrefResp.ok) {
      throw new Error();
    }

    const visitedUrl = new URL(visitedHrefResp.url);

    const webfingerUrl = new URL(visitedUrl.origin);
    webfingerUrl.pathname = ".well-known/webfinger";
    webfingerUrl.searchParams.set("resource", visitedUrl.toString());

    let webfingerResp = await fetch(webfingerUrl);
    if (!webfingerResp.ok) {
      const openIdRelMe = constructOpenIDUrl(visitedRelMeUrl);
      webfingerResp = await fetch(openIdRelMe);
      if (!webfingerResp.ok) {
        throw new Error();
      }
    }

    const webfinger: Webfinger = await webfingerResp.json();
    for (const webfingerLink of webfinger.links ?? []) {
      if (
        getIsRelWebfingerProfilePageRel(webfingerLink.rel) &&
        !!webfingerLink.href
      ) {
        return {
          type: "profile",
          profileUrl: webfingerLink.href,
        };
      }
    }
  } catch (err) {
    // Nothing
  }

  return { type: "notProfile" };
}

export function getDisplayHref(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch (err) {
    return href;
  }

  let pathnameWithStrippedTrailingSlash = url.pathname;
  const trailingSlash = "/";
  if (pathnameWithStrippedTrailingSlash.endsWith(trailingSlash)) {
    pathnameWithStrippedTrailingSlash = pathnameWithStrippedTrailingSlash.slice(
      0,
      -trailingSlash.length,
    );
  }

  let strippedUrl = `${url.host}${pathnameWithStrippedTrailingSlash}${url.search}`;

  const wwwDot = "www.";
  if (strippedUrl.startsWith(wwwDot)) {
    strippedUrl = strippedUrl.slice(wwwDot.length);
  }

  return strippedUrl;
}

export function storageFactory<T extends NotNullNotUndefined>(args: {
  parse(storageData: any): DeepReadonly<T>;
  serialize(data: DeepReadonly<T>): any;
  storageKey: string;
  onChange?(args: {
    prev: DeepReadonly<T>;
    curr: DeepReadonly<T>;
  }): void | Promise<void>;
}): {
  (cb?: (data: DeepReadonly<T>) => DeepReadonly<T>): Promise<DeepReadonly<T>>;
} {
  let lastDataPromise: Promise<DeepReadonly<T>> = Promise.resolve(
    args.parse(undefined),
  );

  return (cb) => {
    const oldLastDataPromise = lastDataPromise;
    lastDataPromise = new Promise((res) => {
      oldLastDataPromise.then(async (oldValue) => {
        try {
          const storageData = (
            await browser.storage.local.get(args.storageKey)
          )?.[args.storageKey];

          const data = args.parse(storageData);
          const changedData = cb?.(data);

          if (changedData !== undefined) {
            await Promise.all([
              browser.storage.local.set({
                [args.storageKey]: args.serialize(changedData),
              }),
              args.onChange?.({
                prev: data,
                curr: changedData,
              }),
            ]);
          }

          res(changedData ?? data);
        } catch (err) {
          res(oldValue);
        }
      });
    });

    return lastDataPromise;
  };
}

export const getIconState = storageFactory({
  storageKey: "icon-state-3",
  parse(storageData) {
    const iconState: { state: "on" | "off"; unreadCount?: number | undefined } =
      storageData ?? { state: "off" };
    return iconState;
  },
  serialize(iconState) {
    return iconState;
  },
  onChange({ prev, curr }) {
    /**
     * Firefox is still at manifest v2
     */
    const browserAction =
      __TARGET__ === "firefox" ? browser.browserAction : browser.action;

    /**
     * Safari can't render grayed out icon
     */
    if (__TARGET__ !== "safari") {
      const path = curr.state === "off" ? actionInactive : actionActive;

      browserAction.setIcon({
        path: path,
      });
    }

    browserAction.setBadgeBackgroundColor({ color: "#9f99f5" });

    const badgeText = curr.unreadCount ? `+${curr.unreadCount}` : "";
    browserAction.setBadgeText({ text: badgeText });
  },
});

export const getHrefStore = storageFactory({
  storageKey: "rel-me-href-data-store-3",
  parse(storageData) {
    let hrefStore: HrefStore;
    try {
      hrefStore = new Map(storageData);
    } catch (err) {
      hrefStore = new Map();
    }
    return hrefStore;
  },
  serialize(hrefStore) {
    return Array.from(hrefStore.entries());
  },
  async onChange({ prev, curr }) {
    const prevProfiles = getProfiles(prev);
    const currProfiles = getProfiles(curr);
    if (currProfiles.size > prevProfiles.size) {
      getIconState((iconState) => ({
        state: "on",
        unreadCount:
          (iconState.unreadCount ?? 0) +
          (currProfiles.size - prevProfiles.size),
      }));
    }
  },
});

function getDataUrlFromFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject();
        }
      },
      false,
    );
    reader.addEventListener("error", () => {
      reject();
    });

    reader.readAsDataURL(file);
  });
}

export async function exportProfiles(): Promise<void> {
  const profiles = Array.from(getProfiles(await getHrefStore()).values());

  const blob = new Blob([JSON.stringify(profiles)], {
    type: "application/json",
  });

  browser.tabs.create({
    url:
      /**
       * Chrome needs to use this method, because otherwise the blob isn't
       * recognized as a JSON file and won't allow downloading via command + s.
       * the opened tab will have a url blob:chrome-extension instead of data:application/json
       */
      __TARGET__ === "chrome"
        ? await getDataUrlFromFile(blob)
        : URL.createObjectURL(blob),
  });

  window.close();
}

/**
 * Test the safe storage
 */
// {
//   const getInc = storageFactory({
//     storageKey: "inc2",
//     parse(storageData) {
//       let num: number;
//       if (typeof storageData === "number" && !isNaN(storageData)) {
//         num = storageData;
//       } else {
//         num = 0;
//       }
//       return num;
//     },
//     serialize(inc) {
//       return inc;
//     },
//   });

//   chrome.runtime.onMessage.addListener(async () => {
//     /**
//      * @param {number} sleepMs
//      * @returns {Promise<void>}
//      */
//     function sleep(sleepMs) {
//       return new Promise((res) => {
//         setTimeout(() => {
//           res();
//         }, sleepMs);
//       });
//     }

//     getInc((inc) => {
//       console.log(inc, inc === 0);
//       return inc + 1;
//     });
//     getInc((inc) => {
//       console.log(inc, inc === 1);
//       return inc + 1;
//     });
//     await getInc((inc) => {
//       console.log(inc, inc === 2);
//       return inc + 1;
//     });
//     getInc((inc) => {
//       console.log(inc, inc === 3);
//       return inc + 1;
//     });
//     console.log("sleep");
//     await sleep(1000);
//     console.log("wakeup");
//     getInc((inc) => {
//       console.log(inc, inc === 4);
//       return inc + 1;
//     });
//     getInc((inc) => {
//       console.log(inc, inc === 5);
//       return inc + 1;
//     });
//     await getInc((inc) => {
//       console.log(inc, inc === 6);
//       return inc + 1;
//     });
//     getInc((inc) => {
//       console.log(inc, inc === 7);
//     });
//   });
// }
