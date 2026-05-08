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
import { register as registerMove } from "./tools/move.js";
import { register as registerTrash } from "./tools/trash.js";
import { register as registerCreateMailbox } from "./tools/create_mailbox.js";
import { register as registerBulkMarkRead } from "./tools/bulk_mark_read.js";
import { register as registerGetUnsubscribeLink } from "./tools/get_unsubscribe_link.js";
import { register as registerListSenders } from "./tools/list_senders.js";
import { register as registerEmptyMailbox } from "./tools/empty_mailbox.js";

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
registerMove(server);
registerTrash(server);
registerCreateMailbox(server);
registerBulkMarkRead(server);
registerGetUnsubscribeLink(server);
registerListSenders(server);
registerEmptyMailbox(server);

const transport = new StdioServerTransport();
await server.connect(transport);
