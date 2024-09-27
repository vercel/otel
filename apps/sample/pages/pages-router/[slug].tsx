import { GetServerSidePropsContext } from 'next';
import Link from 'next/link';

export default function PageSlug({
  slug,
  data,
  json,
}: {
  slug: string;
  json: any;
  data: any;
}) {
  return (
    <>
      <div>Slug: {slug}</div>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <pre>{JSON.stringify(json, null, 2)}</pre>
      <Link href="/pages-router">Go back</Link>
    </>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const { params } = ctx;
  const json = await import('/public/fixture.json').then((m) => m.default);

  return {
    props: {
      slug: params?.slug,
      json,
      data: { val: Math.round(Math.random() * 100) },
    },
  };
}
