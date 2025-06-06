import https from "node:https";
import { trace } from "@opentelemetry/api";
import { cookies } from "next/headers";
import { NextResponse } from 'next/server';

const url = new URL("https://api.github.com/repos/vercel/next.js");
const requestOptions = {
	hostname: url.hostname,
	port: url.port,
	path: url.pathname,
	method: "GET",
	headers: {
		"User-Agent": "Node.js HTTP Client",
	},
};

function getGitHubStars(): Promise<Record<string, unknown>> {
	let data = "";

	return new Promise((resolve, reject) => {
		https
			.get(requestOptions, (response) => {
				response.on("data", (chunk) => {
					data += chunk;
				});
				response.on("end", () => {
					resolve(JSON.parse(data));
				});
			})
			.on("error", reject);
	});
}

export const GET = async () => {
	cookies();

    let stars: Record<string, unknown> | null = null;
	await trace
		.getTracer("sample")
		.startActiveSpan("http-example", async (span) => {
			try {
				stars = await getGitHubStars();
				console.log("GitHub stars:", stars.stargazers_count);
			} finally {
                span.end();
			}
		});
    return NextResponse.json(stars);
};

