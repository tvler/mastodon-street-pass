import "webextension-polyfill";
import * as React from "react";
import * as ReactDom from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import * as Tabs from "@radix-ui/react-tabs";
import { InView } from "react-intersection-observer";
import {
  HrefDataType,
  Message,
  MessageReturn,
  PopupTab,
  hideProfilesFormId,
} from "./util/constants";
import { getDisplayHref } from "./util/getDisplayHref";
import { exportProfiles } from "./util/exportProfiles";
import {
  getIconState,
  getHrefStore,
  getProfileUrlScheme,
  getHideProfilesOnClick,
} from "./util/storage";
import { cx } from "class-variance-authority";
import { getProfileUrl } from "./util/getProfileUrl";
import { downloadLink } from "../../constants";
import { getHrefProps } from "./util/getHrefProps";
import {
  useHrefStoreQuery,
  useProfileUrlSchemeQuery,
  useHideProfilesOnClickQuery,
} from "./util/reactQuery";

getIconState(() => {
  return { state: "off" };
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity } },
});

const button = cx(
  "flex h-[1.68em] min-w-[1.4em] shrink-0 cursor-default items-center justify-center rounded-6 bg-faded px-[0.38em] text-11 font-medium focus-visible:outline-none",
);

const buttonCheckbox = cx("scale-[0.82]");

function Popup() {
  const [hideProfiles, setHideProfiles] = React.useState(false);
  const hrefStoreQuery = useHrefStoreQuery();
  const profileUrlSchemeQuery = useProfileUrlSchemeQuery();
  const hideProfilesOnClickQuery = useHideProfilesOnClickQuery();
  const popoverCloseRef = React.useRef<HTMLButtonElement>(null);
  const profileUrlSchemeInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex h-[600px] w-[350px] flex-col overflow-auto bg-primaryBg">
      <div className="flex flex-col items-center pt-[12px]">
        <img src="/icon-128.png" width="36" height="36" />

        <h1 className="text-14 font-medium leading-[1.21] text-primaryText">
          StreetPass
        </h1>
      </div>

      <div className="flex grow flex-col gap-[18px] px-12 py-[18px]">
        <Profiles
          hideProfiles={hideProfiles}
          profiles={hrefStoreQuery.data?.profiles}
        />

        {!!hrefStoreQuery.data?.hiddenProfiles.length && (
          <details
            className="peer mt-auto"
            tabIndex={
              /* Safari autofocuses this element when the popup opens */
              -1
            }
          >
            <summary
              tabIndex={
                /* Safari autofocuses this element when the popup opens */
                -1
              }
              className="text-13 text-secondaryText"
            >
              Hidden
            </summary>

            <div className="flex flex-col gap-[18px] pt-[18px]">
              <Profiles
                hideProfiles={hideProfiles}
                profiles={hrefStoreQuery.data?.hiddenProfiles}
              />
            </div>
          </details>
        )}

        {hrefStoreQuery.data?.profiles.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center peer-open:hidden">
            <p className="pointer-events-auto text-13 text-secondaryText">
              No profiles
              {hrefStoreQuery.data.hiddenProfiles.length === 0 && (
                <>
                  . Try{" "}
                  <a
                    {...getHrefProps("https://streetpass.social")}
                    className="font-medium text-accent"
                  >
                    this
                  </a>
                  !
                </>
              )}
            </p>
          </div>
        )}
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
            type="button"
            className={cx(button, "text-secondaryText")}
            onClick={(ev) => {
              const formElements = ev.currentTarget.form?.elements;
              if (!formElements) {
                return;
              }

              for (const formElement of formElements) {
                if (formElement instanceof HTMLInputElement) {
                  formElement.checked = true;
                }
              }
            }}
          >
            Hide All
          </button>

          <button className={cx(button, "text-accent")}>Save</button>
        </form>
      </div>

      <div
        className="absolute right-12 top-12 flex gap-8"
        hidden={hideProfiles}
      >
        {!!hrefStoreQuery.data?.profiles.length && (
          <span className={cx(button, "text-accent")}>
            {hrefStoreQuery.data?.profiles.length}
          </span>
        )}

        <Popover.Root modal>
          <Popover.Close hidden ref={popoverCloseRef} />

          <Popover.Trigger className={cx(button, "text-accent")}>
            <svg
              fill="currentColor"
              className="size-[1em]"
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
              className="flex rounded-6 border border-primaryBorder bg-primaryBg"
              onOpenAutoFocus={(ev) => {
                ev.preventDefault();
              }}
              onCloseAutoFocus={(ev) => {
                ev.preventDefault();
              }}
            >
              <Tabs.Root defaultValue={PopupTab.root} className="contents">
                <Tabs.Content
                  value={PopupTab.root}
                  className="flex flex-col items-start gap-y-8 p-8"
                >
                  <Tabs.List className="contents">
                    <Tabs.Trigger
                      value={PopupTab.openProfilesWith}
                      className={cx(button, "text-accent")}
                    >
                      Open Profiles With…
                    </Tabs.Trigger>
                  </Tabs.List>

                  <Popover.Close
                    className={cx(button, "text-accent")}
                    onClick={() => {
                      setHideProfiles((prev) => !prev);
                    }}
                  >
                    Hide Profiles…
                  </Popover.Close>

                  <label className={cx(button, "text-accent")}>
                    Hide Profiles On Click&nbsp;
                    <input
                      type="checkbox"
                      defaultChecked={hideProfilesOnClickQuery.data}
                      className={buttonCheckbox}
                      onChange={async (ev) => {
                        await getHideProfilesOnClick(() => ev.target.checked);
                        queryClient.refetchQueries();
                      }}
                    />
                  </label>

                  <Popover.Close
                    onClick={exportProfiles}
                    className={cx(button, "text-accent")}
                  >
                    Export (.json)
                  </Popover.Close>

                  <ConfirmButton
                    className={cx(
                      button,
                      "text-accent data-[confirm]:text-[--red-10]",
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
                    className={cx(button, "text-accent")}
                    {...getHrefProps(downloadLink[__TARGET__])}
                  >
                    Rate StreetPass
                  </a>
                </Tabs.Content>

                <Tabs.Content
                  value={PopupTab.openProfilesWith}
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
                      <span className="px-8 text-12 text-secondaryText">
                        URL to open profiles with. Set as empty for default
                        behavior.
                      </span>

                      <input
                        spellCheck={false}
                        type="text"
                        placeholder="https://mastodon.example/@{account}"
                        className="mx-8 rounded-6 border border-primaryBorder bg-secondaryBg px-6 py-2 text-12 text-primaryText placeholder:text-[--gray-a10]"
                        ref={profileUrlSchemeInputRef}
                        defaultValue={profileUrlSchemeQuery.data}
                        key={profileUrlSchemeQuery.data}
                      />
                    </label>

                    <span className="px-8 text-12 text-secondaryText">
                      …or select a preset:
                    </span>

                    <div className="flex flex-wrap gap-8 px-8">
                      {(
                        [
                          "elk",
                          "icecubes",
                          "ivory",
                          "mastodon.online",
                          "mastodon.social",
                          "mona",
                          "phanpy",
                          "bluesky",
                        ] as const
                      ).map((item) => {
                        return (
                          <React.Fragment key={item}>
                            <button
                              type="button"
                              className={cx(button, "text-accent")}
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
                                  mona: "mona:{profileUrl.noProtocol}",
                                  phanpy: `https://phanpy.social/#/https:{profileUrl.noProtocol}`,
                                  bluesky: `https://bsky.app/profile/{account}`,
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
                                  mona: "Mona",
                                  phanpy: "Phanpy",
                                  bluesky: "Bluesky",
                                }[item]
                              }
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>

                    <div className="flex justify-end gap-x-8 border-t border-primaryBorder px-8 py-8">
                      <button
                        type="button"
                        onClick={() => {
                          if (!profileUrlSchemeInputRef.current) {
                            return;
                          }

                          profileUrlSchemeInputRef.current.value = "";
                          profileUrlSchemeInputRef.current.focus();
                        }}
                        className={cx(button, "text-secondaryText")}
                      >
                        Clear
                      </button>

                      <button className={cx(button, "text-accent")}>
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
          <p className="shrink-0 text-13 text-secondaryText">
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

                  <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-primaryText opacity-[0.14]" />
                </>
              ) : (
                <div className="flex w-full items-center justify-center bg-faded text-accent">
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
                className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-accent"
                title={profileDisplayName}
              >
                {profileDisplayName}
              </a>

              {!props.hideProfiles && (
                <span className="shrink-0 text-[12px] text-secondaryText">
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
              className="self-start break-all text-[12.5px] leading-[1.5] text-secondaryText"
            >
              {getDisplayHref(hrefData.websiteUrl)}
            </a>
          </div>

          {props.hideProfiles && (
            <label className={cx(button, "ml-8 text-accent")}>
              Hide&nbsp;
              <input
                name={hrefData.relMeHref}
                form={hideProfilesFormId}
                type="checkbox"
                defaultChecked={hrefData.hidden}
                className={buttonCheckbox}
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
