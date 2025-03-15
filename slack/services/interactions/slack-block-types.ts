/**
 * Type definitions for Slack block kit UI components
 */

export type SlackTextObject = {
  type: string;
  text: string;
  emoji?: boolean;
};

export type SlackBlockElement = {
  type: string;
  action_id?: string;
  placeholder?: SlackTextObject;
  initial_value?: string;
  [key: string]: unknown;
};

export type SlackInputBlock = {
  type: "input";
  block_id: string;
  element: SlackBlockElement;
  label: SlackTextObject;
  hint?: SlackTextObject;
  optional?: boolean;
};

export type SlackDividerBlock = {
  type: "divider";
};

export type SlackSectionBlock = {
  type: "section";
  text: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  accessory?: SlackBlockElement;
};

export type SlackAnyBlock = {
  type: string;
  block_id?: string;
  text?: { type: string; text: string; emoji?: boolean };
  element?: { type: string; [key: string]: unknown };
  label?: { type: string; text: string; emoji?: boolean };
  hint?: { type: string; text: string; emoji?: boolean };
  [key: string]: unknown;
};

export type SlackBlock = SlackSectionBlock | SlackDividerBlock | SlackInputBlock | SlackAnyBlock;

export type SlackModalView = {
  type: "modal";
  callback_id?: string;
  title: SlackTextObject;
  submit?: SlackTextObject;
  close?: SlackTextObject;
  blocks: SlackBlock[];
  private_metadata?: string;
};
