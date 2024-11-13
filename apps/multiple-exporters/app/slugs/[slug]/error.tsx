"use client";

type AppError = Error & {
  status?: string | number;
  digest?: string;
};

export default function ErrorPage({ error }: { error: AppError }): JSX.Element {
  return (
    <main>
      <div style={{ color: "red" }}>ERROR: {error.message}</div>
      <div>Status: {error.status ?? "n/a"}</div>
      <div>Digest: {error.digest ?? "n/a"}</div>
    </main>
  );
}
