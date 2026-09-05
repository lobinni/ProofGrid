"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  isActive,
  children,
  className,
}: {
  href: string;
  isActive?: (pathname: string) => boolean;
  className?: string;
  children: React.ReactNode | ((active: boolean) => React.ReactNode);
}) {
  const pathname = usePathname();
  const active = isActive ? isActive(pathname) : pathname === href;
  return (
    <Link href={href} className={className}>
      {typeof children === "function" ? children(active) : children}
    </Link>
  );
}
