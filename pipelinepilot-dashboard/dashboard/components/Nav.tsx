import Link from 'next/link';
export default function Nav() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/campaigns">Campaigns</Link>
      <Link href="/campaigns/new">New</Link>
      <Link href="/settings/keys">Keys</Link>
      <Link href="/login">Login</Link>
    </nav>
  );
}
