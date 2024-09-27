import Link from 'next/link';

export default function Page({ name }: { name: string }) {
  return (
    <>
      <div>Pages router page: {name}</div>
      <Link href="/pages-router/slug">Go to slug</Link>
    </>
  );
}

export async function getServerSideProps() {
  return {
    props: {
      name: 'hello',
    },
  };
}
