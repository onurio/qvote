// Define the structure of a Slack interaction payload
export interface SlackInteraction {
  type: string;
  user: {
    id: string;
    username?: string;
    name?: string;
  };
  trigger_id: string;
  team: {
    id: string;
    domain?: string;
  };
  channel: {
    id: string;
    name?: string;
  };
  actions?: {
    action_id: string;
    block_id: string;
    value?: string;
    type: string;
    [key: string]: unknown;
  }[];
  view?: {
    id: string;
    state: {
      values: Record<string, Record<string, { value: string }>>;
    };
    private_metadata?: string;
    [key: string]: unknown;
  };
  response_url?: string;
  [key: string]: unknown;
}

// Define a type for Slack blocks
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: {
      type: string;
      text: string;
      emoji?: boolean;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface InteractionResponse {
  status: number;
  body: {
    response_type?: "ephemeral" | "in_channel";
    text?: string;
    blocks?: SlackBlock[];
    replace_original?: boolean;
    delete_original?: boolean;
    [key: string]: unknown;
  };
}
