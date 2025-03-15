// This file now re-exports from the interactions module
// to maintain backward compatibility
import { openVoteCreationModal, routeSlackInteraction } from "./interactions/index.ts";
import type { InteractionResponse, SlackBlock, SlackInteraction } from "./interactions/index.ts";

export { openVoteCreationModal, routeSlackInteraction };
export type { InteractionResponse, SlackBlock, SlackInteraction };
