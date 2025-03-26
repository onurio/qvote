import { assertEquals, assertStringIncludes } from "@std/assert";
import { 
  createVoteCreationModalView, 
  createVotingModalView, 
  createVoteSuccessModalView 
} from "./templates.ts";
import { 
  SlackModalView, 
  SlackBlock, 
  SlackInputBlock, 
  SlackSectionBlock 
} from "./slack-block-types.ts";

Deno.test("createVoteCreationModalView creates proper modal structure", () => {
  const channelId = "channel-123";
  const userId = "user-456";
  
  const modal = createVoteCreationModalView(channelId, userId);
  
  // Verify basic modal structure
  assertEquals(modal.type, "modal");
  assertEquals(modal.callback_id, "create_vote_submission");
  assertEquals(modal.title.text, "Create Vote");
  assertEquals(modal.submit?.text, "Create");
  assertEquals(modal.close?.text, "Cancel");
  
  // Verify blocks count (should be 5 input blocks)
  assertEquals(modal.blocks.length, 5);
  
  // Verify title input
  const titleBlock = modal.blocks[0] as SlackInputBlock;
  assertEquals(titleBlock.type, "input");
  assertEquals(titleBlock.block_id, "vote_title");
  assertEquals(titleBlock.element.type, "plain_text_input");
  
  // Verify description input (optional)
  const descBlock = modal.blocks[1] as SlackInputBlock;
  assertEquals(descBlock.type, "input");
  assertEquals(descBlock.block_id, "vote_description");
  assertEquals(descBlock.optional, true);
  
  // Verify options input
  const optionsBlock = modal.blocks[2] as SlackInputBlock;
  assertEquals(optionsBlock.type, "input");
  assertEquals(optionsBlock.block_id, "vote_options");
  assertEquals(optionsBlock.element.multiline, true);
  
  // Verify allowed voters (optional)
  const votersBlock = modal.blocks[3] as SlackInputBlock;
  assertEquals(votersBlock.type, "input");
  assertEquals(votersBlock.block_id, "vote_allowed_voters");
  assertEquals(votersBlock.optional, true);
  assertEquals(votersBlock.element.type, "multi_users_select");
  
  // Verify credits input
  const creditsBlock = modal.blocks[4] as SlackInputBlock;
  assertEquals(creditsBlock.type, "input");
  assertEquals(creditsBlock.block_id, "vote_credits");
  assertEquals(creditsBlock.element.initial_value, "100");
  
  // Verify private metadata
  const metadata = JSON.parse(modal.private_metadata || "{}");
  assertEquals(metadata.channelId, channelId);
  assertEquals(metadata.userId, userId);
});

Deno.test("createVotingModalView creates proper voting modal for new vote", () => {
  // Create mock vote data
  const vote = {
    id: "vote-123",
    title: "Test Vote",
    description: "This is a test vote",
    creditsPerUser: 100,
    options: ["Option 1", "Option 2", "Option 3"]
  };
  
  const modal = createVotingModalView(vote);
  
  // Verify basic modal structure
  assertEquals(modal.type, "modal");
  assertEquals(modal.callback_id, "vote_submission");
  assertEquals(modal.title.text, "Vote");
  
  // Verify the title and description section
  const titleBlock = modal.blocks[0] as SlackSectionBlock;
  assertEquals(titleBlock.type, "section");
  assertStringIncludes(titleBlock.text.text, "*Test Vote*");
  assertStringIncludes(titleBlock.text.text, "This is a test vote");
  
  // Verify credits explanation
  const creditsBlock = modal.blocks[1] as SlackSectionBlock;
  assertEquals(creditsBlock.type, "section");
  assertStringIncludes(creditsBlock.text.text, "*100* credits");
  assertStringIncludes(creditsBlock.text.text, "perfect square numbers");
  
  // Verify divider
  assertEquals(modal.blocks[2].type, "divider");
  
  // Verify options blocks (2 blocks per option: section + input)
  // Option 1
  const option1SectionBlock = modal.blocks[3] as SlackSectionBlock;
  assertEquals(option1SectionBlock.type, "section");
  assertStringIncludes(option1SectionBlock.text.text, "*Option 1:* Option 1");
  
  const option1InputBlock = modal.blocks[4] as SlackInputBlock;
  assertEquals(option1InputBlock.type, "input");
  assertEquals(option1InputBlock.block_id, "option_0");
  assertEquals(option1InputBlock.element.action_id, "credits_0");
  assertEquals(option1InputBlock.element.initial_value, "0");
  
  // Option 2
  const option2SectionBlock = modal.blocks[5] as SlackSectionBlock;
  assertEquals(option2SectionBlock.type, "section");
  assertStringIncludes(option2SectionBlock.text.text, "*Option 2:* Option 2");
  
  // Option 3
  const option3SectionBlock = modal.blocks[7] as SlackSectionBlock;
  assertEquals(option3SectionBlock.type, "section");
  assertStringIncludes(option3SectionBlock.text.text, "*Option 3:* Option 3");
  
  // Verify metadata
  const metadata = JSON.parse(modal.private_metadata || "{}");
  assertEquals(metadata.voteId, "vote-123");
});

Deno.test("createVotingModalView handles previous votes correctly", () => {
  // Create mock vote data with previous votes
  const vote = {
    id: "vote-123",
    title: "Test Vote",
    description: "This is a test vote",
    creditsPerUser: 100,
    creditsUsed: 25, // 25 credits used
    options: ["Option 1", "Option 2", "Option 3"],
    previousVotes: [
      { optionIndex: 0, credits: 16 }, // 4 votes for Option 1
      { optionIndex: 2, credits: 9 }   // 3 votes for Option 3
    ]
  };
  
  const modal = createVotingModalView(vote);
  
  // Verify credits explanation includes used and remaining
  const creditsBlock = modal.blocks[1] as SlackSectionBlock;
  assertStringIncludes(
    creditsBlock.text.text, 
    "25 used, 75 remaining"
  );
  
  // Verify initial values for each option
  // Option 1 (index 0) should have 16
  const option1InputBlock = modal.blocks[4] as SlackInputBlock;
  assertEquals(option1InputBlock.element.initial_value, "16");
  
  // Option 2 (index 1) should have 0 (no previous vote)
  const option2InputBlock = modal.blocks[6] as SlackInputBlock;
  assertEquals(option2InputBlock.element.initial_value, "0");
  
  // Option 3 (index 2) should have 9
  const option3InputBlock = modal.blocks[8] as SlackInputBlock;
  assertEquals(option3InputBlock.element.initial_value, "9");
});

Deno.test("createVoteSuccessModalView creates proper success modal", () => {
  const title = "My Test Vote";
  
  // Test success with post working
  const modalSuccess = createVoteSuccessModalView(title, { ok: true });
  
  assertEquals(modalSuccess.type, "modal");
  assertEquals(modalSuccess.title.text, "Success");
  
  // Verify success message
  const successMsg = modalSuccess.blocks[0] as SlackSectionBlock;
  assertStringIncludes(
    successMsg.text.text, 
    `:white_check_mark: Vote "My Test Vote" created successfully!`
  );
  
  const successDetails = modalSuccess.blocks[1] as SlackSectionBlock;
  assertStringIncludes(
    successDetails.text.text, 
    "The vote has been posted to the channel."
  );
  
  // Test failure in posting
  const modalPostFailed = createVoteSuccessModalView(title, { ok: false });
  
  const failureDetails = modalPostFailed.blocks[1] as SlackSectionBlock;
  assertStringIncludes(
    failureDetails.text.text, 
    "The vote was created but couldn't be posted to the channel."
  );
  assertStringIncludes(
    failureDetails.text.text, 
    "/invite @QVote"
  );
});

Deno.test("createVotingModalView handles null description", () => {
  // Create mock vote data with null description
  const vote = {
    id: "vote-123",
    title: "Test Vote",
    description: null,
    creditsPerUser: 100,
    options: ["Option 1", "Option 2"]
  };
  
  const modal = createVotingModalView(vote);
  
  // Verify title appears but no description
  const titleBlock = modal.blocks[0] as SlackSectionBlock;
  assertEquals(titleBlock.type, "section");
  assertEquals(titleBlock.text.text, "*Test Vote*");
  
  // Should not contain extra newline
  assertEquals(titleBlock.text.text.includes("\n"), false);
});