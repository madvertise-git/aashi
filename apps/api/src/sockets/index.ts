// The sockets' front door. Business modules import from here only: the
// interfaces, the injection tokens and the shared error. Stand-ins and (later)
// real adapters stay behind it.
export * from "./ads";
export * from "./ai";
export * from "./conversions";
export { type EventHandler, type ProviderEvent, type SocketContext, SocketError, type SocketErrorKind } from "./core";
export * from "./leads";
export * from "./messaging";
export { SocketsModule } from "./sockets.module";
