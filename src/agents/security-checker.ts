import { BaseAgent, type PromptContext } from "./base-agent.js";

export class SecurityCheckerAgent extends BaseAgent {
  name = "security-checker";

  constructor(promptContext?: PromptContext) {
    super(promptContext);
  }
}
