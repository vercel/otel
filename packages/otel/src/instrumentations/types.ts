import type * as http from 'node:http';
import type * as https from 'node:https';


export type RequestOptions = http.RequestOptions;
export type IncomingMessage = http.IncomingMessage;

export type IncomingHttpHeaders = http.IncomingHttpHeaders;
export type OutgoingHttpHeaders = http.OutgoingHttpHeaders;
export type Callback = (res: IncomingMessage) => void;
export type Http = typeof http;
export type Https = typeof https;