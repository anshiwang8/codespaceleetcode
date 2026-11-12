"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/site/Avatar";
import { Icon } from "@/components/site/Icon";
import styles from "@/components/site/site.module.css";

const ITEMS = [
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
] as const;

interface AccountMenuProps {
  login: string;
  avatarVersion: string | null;
}

/**
 * The signed-in header control: the avatar and login open a small menu with Profile, Settings and
 * Sign out. It's a disclosure, not an ARIA menu: plain links and a button, reached with Tab. It
 * closes on Escape (focus returns to the button), a click outside, focus leaving it, or navigation.
 */
export function AccountMenu({ login, avatarVersion }: AccountMenuProps) {
  const { signOut, pending } = useAuth();
  const pathname = usePathname();
  // The page the menu was opened on. Any navigation closes it, since the path no longer matches.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenedOn(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenedOn(null);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget && !root.current?.contains(event.relatedTarget as Node)) setOpen(false);
  };

  return (
    <div className={styles.accountMenu} ref={root} onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        className={styles.account}
        aria-expanded={open}
        aria-controls={menuId}
        title={`Signed in as ${login}`}
        onClick={() => setOpen(!open)}
        data-testid="account-menu-button"
      >
        <Avatar version={avatarVersion} />
        <span className="visually-hidden">Signed in as </span>
        <span className={styles.login} data-testid="signed-in-as">
          {login}
        </span>
        <span className="visually-hidden">, account menu</span>
        <Icon name="chevron-down" className={styles.accountChevron} />
      </button>
      <div id={menuId} className={styles.accountPanel} hidden={!open} data-testid="account-menu">
        <ul>
          {ITEMS.map(({ href, label }) => {
            const current = pathname === href ? "page" : pathname.startsWith(`${href}/`) ? "true" : undefined;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={styles.accountItem}
                  aria-current={current}
                  onClick={() => setOpen(false)}
                  data-testid={`account-menu-${label.toLowerCase()}`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
          <li className={styles.accountDivider}>
            <button
              type="button"
              className={styles.accountItem}
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              disabled={pending}
              aria-busy={pending}
            >
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
