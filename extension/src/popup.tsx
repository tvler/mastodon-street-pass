import "webextension-polyfill";
import * as React from "react";
import * as ReactDom from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import * as Tabs from "@radix-ui/react-tabs";
import { createQuery } from "react-query-kit";
import { InView } from "react-intersection-observer";
import {
  HrefDataType,
  HrefStore,
  MaybePromise,
  Message,
  MessageReturn,
} from "./util/constants";
import { getDisplayHref } from "./util/getDisplayHref";
import { exportProfiles } from "./util/exportProfiles";
import { getProfiles } from "./util/getProfiles";
import {
  getIconState,
  getHrefStore,
  getProfileUrlScheme,
  getHideProfilesOnClick,
} from "./util/storage";
import { cva, cx } from "class-variance-authority";
import { getProfileUrl } from "./util/getProfileUrl";
import { getIsUrlHttpOrHttps } from "./util/getIsUrlHttpOrHttps";
import { downloadLink } from "../../constants";
import { DeepReadonly } from "ts-essentials";

getIconState(() => {
  return { state: "off" };
});

enum Tab {
  root = "root",
  openProfilesWith = "openProfilesWith",
}

const hideProfilesFormId = "hideProfilesFormId";

function getHrefProps(
  baseHref: string,
  getActualHref?: () => MaybePromise<string>,
): Pick<JSX.IntrinsicElements["a"], "href" | "onClick"> {
  return {
    href: baseHref,
    async onClick(ev) {
      ev.preventDefault();
      const { metaKey } = ev;

      const href = (await getActualHref?.()) ?? baseHref;
      if (getIsUrlHttpOrHttps(href)) {
        await browser.tabs.create({
          url: href,
          active: !metaKey,
        });

        if (!metaKey) {
          window.close();
        }
      } else {
        await browser.tabs.update({
          url: href,
        });

        window.close();
      }
    },
  };
}

const useHrefStoreQuery = createQuery({
  queryKey: ["profiles"],
  async fetcher() {
    const hrefStore = await getHrefStore();
    return {
      profiles: getProfiles(hrefStore),
      hiddenProfiles: getProfiles(hrefStore, { hidden: true }),
    };
  },
});

const useProfileUrlSchemeQuery = createQuery({
  queryKey: ["profileurlscheme"],
  fetcher: () => getProfileUrlScheme(),
});

const useHideProfilesOnClickQuery = createQuery({
  queryKey: ["hideprofilesonclick"],
  fetcher: () => getHideProfilesOnClick(),
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity } },
});

const accentColor = cva(["text-[#5f55ec]", "dark:text-[--iris-11]"])();
const primaryColor = cva(["text-[--gray-12]", "dark:text-white"])();
const secondaryColor = cva(["text-[--gray-a11]"])();

const primaryBg = cva(["bg-white", "dark:bg-[--slate-4]"])();
const secondaryBg = cva("bg-[--gray-a2]")();

const borderColor = cva("border-[--gray-a3]")();

const navButton = cva([
  "h-[1.68em]",
  "min-w-[1.4em]",
  "flex",
  "items-center",
  "justify-center",
  "rounded-6",
  "px-[0.38em]",
  "text-11",
  "focus-visible:outline-none",
  "font-medium",
  "bg-faded",
  "cursor-default",
  "shrink-0",
])();

const checkbox = cva("scale-[0.82]")();

function Popup() {
  const [hideProfiles, setHideProfiles] = React.useState(false);
  const hrefStoreQuery = useHrefStoreQuery();
  const profileUrlSchemeQuery = useProfileUrlSchemeQuery();
  const hideProfilesOnClickQuery = useHideProfilesOnClickQuery();
  const popoverCloseRef = React.useRef<HTMLButtonElement>(null);
  const profileUrlSchemeInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div
      className={cx(
        primaryBg,
        "relative flex h-[600px] w-[350px] flex-col overflow-auto",
      )}
    >
      <div className="flex flex-col items-center pt-[12px]">
        <img src="/icon-128.png" width="36" height="36" />

        <h1 className={cx(primaryColor, "text-14 font-medium leading-[1.21]")}>
          StreetPass
        </h1>
      </div>

      {hrefStoreQuery.data?.profiles.length === 0 &&
        hrefStoreQuery.data.hiddenProfiles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className={cx(secondaryColor, "text-13")}>
              No profiles Try{" "}
              <a
                {...getHrefProps("https://streetpass.social")}
                className={cx(accentColor, "font-medium")}
              >
                this
              </a>
              !
            </p>
          </div>
        )}

      <div className="flex grow flex-col gap-[18px] px-12 py-[18px]">
        <Profiles
          hideProfiles={hideProfiles}
          profiles={hrefStoreQuery.data?.profiles}
        />

        <details
          hidden={!hrefStoreQuery.data?.hiddenProfiles.length}
          className="mt-auto"
          tabIndex={
            /* Safari autofocuses this element when the popup opens */
            -1
          }
        >
          <summary className={cx(secondaryColor, "text-13")}>Hidden</summary>

          <div className="flex flex-col gap-[18px] pt-[18px]">
            <Profiles
              hideProfiles={hideProfiles}
              profiles={hrefStoreQuery.data?.hiddenProfiles}
            />
          </div>
        </details>
      </div>

      <div
        className="absolute right-12 top-12 flex gap-8"
        hidden={!hideProfiles}
      >
        <form
          id={hideProfilesFormId}
          className="contents"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const formData = new FormData(ev.currentTarget);

            await getHrefStore((prev) => {
              const hrefStore = new Map(prev);

              for (const [key, hrefData] of hrefStore) {
                const hidden = formData.get(key) === "on";
                hrefStore.set(key, {
                  ...hrefData,
                  hidden: hidden,
                });
              }

              return hrefStore;
            });

            setHideProfiles((prev) => !prev);
            queryClient.refetchQueries();
          }}
        >
          <button
            className={cx(navButton, accentColor)}
            // onClick={() => {
            //   setHideProfiles((prev) => !prev);
            // }}
          >
            Save
          </button>
        </form>
      </div>

      <div
        className="absolute right-12 top-12 flex gap-8"
        hidden={hideProfiles}
      >
        {!!hrefStoreQuery.data?.profiles.length && (
          <span className={cx(accentColor, navButton)}>
            {hrefStoreQuery.data?.profiles.length}
          </span>
        )}

        <Popover.Root modal>
          <Popover.Close hidden ref={popoverCloseRef} />

          <Popover.Trigger className={cx(accentColor, navButton)}>
            <svg
              fill="currentColor"
              className="aspect-square w-[1em]"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="15" cy="50" r="9" />
              <circle cx="50" cy="50" r="9" />
              <circle cx="85" cy="50" r="9" />
            </svg>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              side="bottom"
              sideOffset={6}
              avoidCollisions={false}
              className={cx(primaryBg, borderColor, "flex rounded-6 border")}
              onOpenAutoFocus={(ev) => {
                ev.preventDefault();
              }}
              onCloseAutoFocus={(ev) => {
                ev.preventDefault();
              }}
            >
              <Tabs.Root defaultValue={Tab.root} className="contents">
                <Tabs.Content
                  value={Tab.root}
                  className="flex flex-col items-start gap-y-8 p-8"
                >
                  <Tabs.List className="contents">
                    <Tabs.Trigger
                      value={Tab.openProfilesWith}
                      className={cx(accentColor, navButton)}
                    >
                      Open Profiles With…
                    </Tabs.Trigger>
                  </Tabs.List>

                  <Popover.Close
                    className={cx(accentColor, navButton)}
                    onClick={() => {
                      setHideProfiles((prev) => !prev);
                    }}
                  >
                    Hide Profiles…
                  </Popover.Close>

                  <label className={cx(accentColor, navButton)}>
                    Hide Profiles On Click&nbsp;
                    <input
                      type="checkbox"
                      defaultChecked={hideProfilesOnClickQuery.data}
                      className={checkbox}
                      onChange={async (ev) => {
                        await getHideProfilesOnClick(() => ev.target.checked);
                        queryClient.refetchQueries();
                      }}
                    />
                  </label>

                  <Popover.Close
                    onClick={exportProfiles}
                    className={cx(accentColor, navButton)}
                  >
                    Export (.json)
                  </Popover.Close>

                  <ConfirmButton
                    className={cx(
                      "data-[confirm]:text-[--red-10]",
                      accentColor,
                      navButton,
                    )}
                    onClick={async () => {
                      popoverCloseRef.current?.click();
                      await getHrefStore(() => {
                        return new Map();
                      });
                      queryClient.refetchQueries();
                    }}
                    confirmJsx=" (Confirm)"
                  >
                    Reset
                  </ConfirmButton>

                  <a
                    className={cx(accentColor, navButton)}
                    {...getHrefProps(downloadLink[__TARGET__])}
                  >
                    Rate StreetPass
                  </a>
                </Tabs.Content>

                <Tabs.Content
                  value={Tab.openProfilesWith}
                  className="flex w-[275px] flex-col gap-y-8 pt-8"
                >
                  <form
                    className="contents"
                    onSubmit={async (ev) => {
                      ev.preventDefault();
                      await getProfileUrlScheme(
                        () => profileUrlSchemeInputRef.current?.value.trim(),
                      );
                      queryClient.refetchQueries();
                      popoverCloseRef.current?.click();
                    }}
                  >
                    <label className="contents">
                      <span className={cx(secondaryColor, "px-8 text-12")}>
                        URL to open profiles with. Set as empty for default
                        behavior.
                      </span>

                      <input
                        spellCheck={false}
                        type="text"
                        placeholder="https://mastodon.example/@{account}"
                        className={cx(
                          primaryColor,
                          secondaryBg,
                          borderColor,
                          "mx-8 rounded-6 border px-6 py-2 text-12 placeholder:text-[--gray-a10]",
                        )}
                        ref={profileUrlSchemeInputRef}
                        defaultValue={profileUrlSchemeQuery.data}
                        key={profileUrlSchemeQuery.data}
                      />
                    </label>

                    <span className={cx(secondaryColor, "px-8 text-12")}>
                      …or select a preset:
                    </span>

                    <div className="flex flex-wrap gap-8 px-8">
                      {(
                        [
                          "ivory",
                          "elk",
                          "icecubes",
                          "mastodon.social",
                          "mastodon.online",
                        ] as const
                      ).map((item) => {
                        return (
                          <React.Fragment key={item}>
                            <button
                              type="button"
                              className={cx(accentColor, navButton)}
                              onClick={() => {
                                if (!profileUrlSchemeInputRef.current) {
                                  return;
                                }

                                profileUrlSchemeInputRef.current.value = {
                                  /**
                                   * https://tapbots.com/support/ivory/tips/urlschemes
                                   */
                                  ivory: "ivory://acct/user_profile/{account}",
                                  elk: "https://elk.zone/@{account}",
                                  icecubes:
                                    "icecubesapp:{profileUrl.noProtocol}",
                                  "mastodon.social":
                                    "https://mastodon.social/@{account}",
                                  "mastodon.online":
                                    "https://mastodon.online/@{account}",
                                }[item];

                                profileUrlSchemeInputRef.current.focus();
                              }}
                            >
                              {
                                {
                                  ivory: "Ivory",
                                  elk: "Elk",
                                  icecubes: "Ice Cubes",
                                  "mastodon.social": "mastodon.social",
                                  "mastodon.online": "mastodon.online",
                                }[item]
                              }
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div
                      className={cx(
                        borderColor,
                        "flex justify-end gap-x-8 border-t px-8 py-8",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!profileUrlSchemeInputRef.current) {
                            return;
                          }

                          profileUrlSchemeInputRef.current.value = "";
                          profileUrlSchemeInputRef.current.focus();
                        }}
                        className={cx(secondaryColor, navButton)}
                      >
                        Clear
                      </button>

                      <button className={cx(accentColor, navButton)}>
                        Save
                      </button>
                    </div>
                  </form>
                </Tabs.Content>
              </Tabs.Root>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}

function ConfirmButton(
  props: {
    confirmJsx: React.ReactNode;
  } & Pick<
    JSX.IntrinsicElements["button"],
    "onClick" | "className" | "children"
  >,
) {
  const [confirm, setConfirm] = React.useState(false);

  return (
    <button
      data-confirm={confirm ? "" : undefined}
      className={props.className}
      onClick={
        confirm
          ? props.onClick
          : () => {
              setConfirm(true);
            }
      }
    >
      {props.children}
      {confirm && props.confirmJsx}
    </button>
  );
}

function Profiles(props: {
  profiles: Array<HrefDataType<"profile">> | undefined;
  hideProfiles: boolean;
}) {
  return props.profiles?.map((hrefData, index, arr) => {
    const prevHrefData = arr[index - 1];
    const prevHrefDate = prevHrefData
      ? new Date(prevHrefData.viewedAt).getDate()
      : new Date().getDate();
    const previousItemWasDayBefore =
      prevHrefDate !== new Date(hrefData.viewedAt).getDate();
    const profileHrefProps = getHrefProps(
      hrefData.profileData.profileUrl,
      async () => {
        const [profileUrlScheme, hideProfilesOnClick] = await Promise.all([
          queryClient.fetchQuery(useProfileUrlSchemeQuery.getFetchOptions()),
          queryClient.fetchQuery(useHideProfilesOnClickQuery.getFetchOptions()),
        ]);

        if (hideProfilesOnClick) {
          await getHrefStore((prev) =>
            new Map(prev).set(hrefData.relMeHref, {
              ...hrefData,
              hidden: true,
            }),
          );

          queryClient.refetchQueries();
        }

        return getProfileUrl(hrefData.profileData, profileUrlScheme);
      },
    );
    const profileDisplayName = hrefData.profileData.account
      ? `@${hrefData.profileData.account}`
      : getDisplayHref(hrefData.profileData.profileUrl);

    return (
      <React.Fragment key={`${index}.${hrefData.relMeHref}`}>
        {previousItemWasDayBefore && (
          <p className={cx(secondaryColor, "shrink-0 text-13")}>
            {new Intl.DateTimeFormat(undefined, {
              day: "numeric",
              month: "short",
            }).format(hrefData.viewedAt)}
          </p>
        )}

        <InView
          as="div"
          className="flex items-start"
          triggerOnce
          onChange={async (inView) => {
            if (!inView) {
              return;
            }

            try {
              const message: Message = {
                name: "FETCH_PROFILE_UPDATE",
                args: {
                  relMeHref: hrefData.relMeHref,
                },
              };
              const resp = await MessageReturn.FETCH_PROFILE_UPDATE.parse(
                browser.runtime.sendMessage(message),
              );
              if (!resp) {
                return;
              }

              queryClient.refetchQueries();
            } catch (err) {
              console.error(err);
            }
          }}
        >
          <a
            {...profileHrefProps}
            className="flex shrink-0 pr-[7px] pt-[4px]"
            title={profileDisplayName}
          >
            <div className="relative flex size-[19px] shrink-0 overflow-hidden rounded-full">
              {hrefData.profileData.avatar ? (
                <>
                  <img
                    src={hrefData.profileData.avatar}
                    width={19}
                    height={19}
                    className="object-cover"
                    loading="lazy"
                    decoding="async"
                  />

                  <div
                    className={cx(
                      primaryColor,
                      "pointer-events-none absolute inset-0 rounded-[inherit] border border-current opacity-[0.14]",
                    )}
                  />
                </>
              ) : (
                <div
                  className={cx(
                    accentColor,
                    "flex w-full items-center justify-center bg-faded",
                  )}
                >
                  <svg
                    viewBox="0 0 40 37"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-[12px]"
                  >
                    {nullIconJsx}
                  </svg>
                </div>
              )}
            </div>
          </a>
          <div className="flex min-w-0 grow flex-col">
            <div className="flex items-baseline justify-between gap-x-6 leading-[1.45]">
              <a
                {...profileHrefProps}
                className={cx(
                  accentColor,
                  "overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium",
                )}
                title={profileDisplayName}
              >
                {profileDisplayName}
              </a>

              {!props.hideProfiles && (
                <span className={cx(secondaryColor, "shrink-0 text-[12px]")}>
                  {new Intl.DateTimeFormat(undefined, {
                    timeStyle: "short",
                  })
                    .format(hrefData.viewedAt)
                    .toLowerCase()
                    .replace(/\s+/g, "")}
                </span>
              )}
            </div>

            <a
              {...getHrefProps(hrefData.websiteUrl)}
              className={cx(
                secondaryColor,
                "self-start break-all text-[12.5px] leading-[1.5]",
              )}
            >
              {getDisplayHref(hrefData.websiteUrl)}
            </a>
          </div>

          {props.hideProfiles && (
            <label className={cx(accentColor, navButton, "ml-8")}>
              Hide&nbsp;
              <input
                name={hrefData.relMeHref}
                form={hideProfilesFormId}
                type="checkbox"
                defaultChecked={hrefData.hidden}
                className={checkbox}
              />
            </label>
          )}
        </InView>
      </React.Fragment>
    );
  });
}

const nullIconJsx = (
  <>
    <rect
      x="2"
      y="2"
      width="36"
      height="33"
      rx="3"
      stroke="currentColor"
      strokeWidth="4"
    />
    <rect x="12" y="10" width="4" height="8" rx="2" fill="currentColor" />
    <rect x="24" y="10" width="4" height="8" rx="2" fill="currentColor" />
    <path
      d="M13 24.5V24.5C16.7854 28.5558 23.2146 28.5558 27 24.5V24.5"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

const rootNode = document.getElementById("root");
if (!rootNode) {
  throw new Error();
}

const root = ReactDom.createRoot(rootNode);

root.render(
  <QueryClientProvider client={queryClient}>
    <Popup />
  </QueryClientProvider>,
);
