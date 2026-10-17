import { App } from "@octokit/app";
import { config } from "./config.js";

// null when the GitHub App isn't configured (development without GitHub).
export const githubApp = config.github
  ? new App({ appId: config.github.appId, privateKey: config.github.privateKey, webhooks: { secret: config.github.webhookSecret } })
  : null;

// GitHub's own page where the user picks an account and the repos to allow.
export function installUrl(state) {
  return `https://github.com/apps/${config.github.appSlug}/installations/new?state=${encodeURIComponent(state)}`;
}

// Called as the App itself (JWT), so a made-up installation_id fails here.
export async function fetchInstallation(installationId) {
  const { data } = await githubApp.octokit.request("GET /app/installations/{installation_id}", {
    installation_id: installationId,
  });
  return data;
}

export async function listInstallationRepos(installationId) {
  const repos = [];
  for await (const { repository } of githubApp.eachRepository.iterator({ installationId })) {
    repos.push({
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      owner: repository.owner.login,
      private: repository.private,
      defaultBranch: repository.default_branch,
      htmlUrl: repository.html_url,
      installationId,
    });
  }
  return repos;
}
