export function isLocalEndpoint(url: string): boolean {
  let host: string;
  try {
    host = new URL(url.trim() || "http://localhost:11434").hostname.toLowerCase();
  } catch {
    // Unparseable input gets a clear error from the backend; it is not "remote".
    return true;
  }
  host = host.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || /^127(\.\d{1,3}){3}$/.test(host);
}

export function endpointHost(url: string): string {
  try {
    return new URL(url.trim()).host;
  } catch {
    return url.trim();
  }
}
