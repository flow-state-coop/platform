export function isNumber(value: string) {
  return !isNaN(Number(value)) && !isNaN(parseFloat(value));
}

export function extractTwitterHandle(url: string) {
  if (!url) {
    return null;
  }

  const match = url.match(/^https?:\/\/(www\.)?twitter.com\/@?(?<handle>\w+)/);

  return match?.groups?.handle ? `${match.groups.handle}` : null;
}

export function extractGithubUsername(url: string) {
  if (!url) {
    return null;
  }

  const match = url.match(/^https?:\/\/(www\.)?github.com\/@?(?<username>\w+)/);

  return match?.groups?.username ? `${match.groups.username}` : null;
}
