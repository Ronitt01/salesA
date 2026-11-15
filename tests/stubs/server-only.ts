// The real "server-only" package throws when imported outside a React Server
// Components bundle. Tests run in plain Node, so it is replaced with this no-op.
export {};
