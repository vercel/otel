import { type Props, Component } from "../../component";
import http from "node:http"
export const dynamic = "force-dynamic";

export default function Home(props: Props) {
  return <Component {...props} http={http} />;
}
