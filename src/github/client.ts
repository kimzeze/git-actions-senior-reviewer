import { Octokit } from "@octokit/rest";

let instance: Octokit | null = null;

export function getOctokit(token: string): Octokit {
  if (!instance) {
    instance = new Octokit({ auth: token });
  }
  return instance;
}
