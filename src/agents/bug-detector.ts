import { BaseAgent, type PromptContext } from "./base-agent.js";

export class BugDetectorAgent extends BaseAgent {
  name = "bug-detector";

  constructor(promptContext?: PromptContext) {
    super(promptContext);
  }
}
