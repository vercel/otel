import { type Props, Component } from "../../../component";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Home(props: Props) {
  return <Component {...props} />;
}
