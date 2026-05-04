#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { register as registerSearch } from "./tools/search.js";
import { register as registerRead } from "./tools/read.js";
import { register as registerAccounts } from "./tools/accounts.js";
import { register as registerListRecent } from "./tools/list_recent.js";
import { register as registerSend } from "./tools/send.js";
import { register as registerReply } from "./tools/reply.js";
import { register as registerFlags } from "./tools/flags.js";

const server = new McpServer({
  name: "mail-app-mcp",
  version: "1.0.0",
});

registerSearch(server);
registerRead(server);
registerAccounts(server);
registerListRecent(server);
registerSend(server);
registerReply(server);
registerFlags(server);

const transport = new StdioServerTransport();
await server.connect(transport);
