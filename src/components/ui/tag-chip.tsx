import Link from "next/link";

export function TagChip({ name, displayName }: { name: string; displayName: string }) {
  return (
    <Link
      href={`/tags/${encodeURIComponent(name)}`}
      className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-strong hover:bg-blue-100"
    >
      #{displayName}
    </Link>
  );
}
