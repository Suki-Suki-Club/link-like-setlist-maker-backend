const API_BASE = "https://api.github.com";

export type GitHubConfig = {
  token: string;
  /** "owner/repo" 形式 */
  repository: string;
  branch: string;
  baseBranch: string;
};

type FileChange = {
  path: string;
  content: string;
};

async function githubRequest(
  config: GitHubConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: "application/vnd.github+json",
      "user-agent": "link-like-setlist-maker-catalog-sync",
      ...(body !== undefined ? { "content-type": "application/json" } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * base ブランチから作業ブランチを作り直し(force)、変更ファイルを 1 コミットで積んで
 * PR を open する。既に open な PR があればブランチ更新だけで済ませる。
 */
export async function pushChangesAndOpenPr(
  config: GitHubConfig,
  input: {
    files: FileChange[];
    commitMessage: string;
    prTitle: string;
    prBody: string;
    labels: string[];
  }
): Promise<{ prNumber: number; prUrl: string }> {
  const repoPath = `/repos/${config.repository}`;

  const baseRef = (await githubRequest(config, "GET", `${repoPath}/git/ref/heads/${config.baseBranch}`)) as {
    object: { sha: string };
  };
  const baseSha = baseRef.object.sha;

  const baseCommit = (await githubRequest(config, "GET", `${repoPath}/git/commits/${baseSha}`)) as {
    tree: { sha: string };
  };

  const tree = (await githubRequest(config, "POST", `${repoPath}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree: input.files.map((file) => ({
      path: file.path,
      mode: "100644",
      type: "blob",
      content: file.content
    }))
  })) as { sha: string };

  const commit = (await githubRequest(config, "POST", `${repoPath}/git/commits`, {
    message: input.commitMessage,
    tree: tree.sha,
    parents: [baseSha]
  })) as { sha: string };

  try {
    await githubRequest(config, "POST", `${repoPath}/git/refs`, {
      ref: `refs/heads/${config.branch}`,
      sha: commit.sha
    });
  } catch {
    await githubRequest(config, "PATCH", `${repoPath}/git/refs/heads/${config.branch}`, {
      sha: commit.sha,
      force: true
    });
  }

  const [owner] = config.repository.split("/");
  const openPrs = (await githubRequest(
    config,
    "GET",
    `${repoPath}/pulls?state=open&head=${owner}:${config.branch}`
  )) as Array<{ number: number; html_url: string }>;

  let prNumber: number;
  let prUrl: string;

  if (openPrs.length > 0) {
    prNumber = openPrs[0].number;
    prUrl = openPrs[0].html_url;
    await githubRequest(config, "PATCH", `${repoPath}/pulls/${prNumber}`, {
      title: input.prTitle,
      body: input.prBody
    });
  } else {
    const pr = (await githubRequest(config, "POST", `${repoPath}/pulls`, {
      title: input.prTitle,
      body: input.prBody,
      head: config.branch,
      base: config.baseBranch
    })) as { number: number; html_url: string };
    prNumber = pr.number;
    prUrl = pr.html_url;
  }

  // ラベルを付け替える(auto ↔ needs-review が日によって変わるため)
  const managedLabels = ["catalog-sync:auto", "catalog-sync:needs-review"];
  for (const label of managedLabels) {
    if (!input.labels.includes(label)) {
      await githubRequest(
        config,
        "DELETE",
        `${repoPath}/issues/${prNumber}/labels/${encodeURIComponent(label)}`
      ).catch(() => undefined);
    }
  }

  if (input.labels.length > 0) {
    await githubRequest(config, "POST", `${repoPath}/issues/${prNumber}/labels`, {
      labels: input.labels
    });
  }

  return { prNumber, prUrl };
}
