import Link from "next/link";
import { Grid2x2 } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--accent)] text-black">
        <Grid2x2 className="h-6 w-6" strokeWidth={2.4} />
      </span>
      <h1 className="mt-6 text-6xl font-bold tracking-tight text-[var(--fg)]">404</h1>
      <p className="mt-2 text-xs tracking-normal text-[var(--muted)]">
        No verdict on this route
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-10 items-center rounded-md bg-[var(--accent)] px-5 text-xs font-bold tracking-normal text-black transition-transform hover:scale-[1.03]"
      >
        Back to the board
      </Link>
    </div>
  );
}
