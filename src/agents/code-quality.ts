import { BaseAgent, type PromptContext } from "./base-agent.js";

export class CodeQualityAgent extends BaseAgent {
  name = "code-quality";

  constructor(promptContext?: PromptContext) {
    super(promptContext);
  }
}
