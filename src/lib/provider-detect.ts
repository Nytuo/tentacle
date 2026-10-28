export type ProviderType = "github" | "gitlab" | "bitbucket";

export interface DetectedProvider {
  providerType: ProviderType;
  host: string;
  owner: string;
  repo: string;
  baseUrl: string;
}

export function detectProvider(url: string): DetectedProvider | null {
  const trimmed = url.trim();
  let host: string;
  let path: string;

  const withScheme = trimmed.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?\/(.+)$/i);
  const scp = trimmed.match(/^(?:[^@/\s]+@)?([^/:\s]+):(?!\/)(.+)$/);
  if (withScheme) {
    [, host, path] = withScheme;
  } else if (scp) {
    [, host, path] = scp;
  } else {
    return null;
  }

  const parts = path
    .replace(/\.git\/?$/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) return null;

  const h = host.toLowerCase();
  let providerType: ProviderType;
  if (h === "github.com" || h.endsWith(".github.com")) providerType = "github";
  else if (h === "bitbucket.org") providerType = "bitbucket";
  else if (h === "gitlab.com" || h.includes("gitlab")) providerType = "gitlab";
  else return null;

  const owner = providerType === "gitlab" ? parts.slice(0, -1).join("/") : parts[0];
  const repo = providerType === "gitlab" ? parts[parts.length - 1] : parts[1];

  return {
    providerType,
    host: h,
    owner,
    repo,
    baseUrl: providerType === "gitlab" ? `https://${h}` : "",
  };
}
