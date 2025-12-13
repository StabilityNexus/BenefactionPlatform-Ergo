export function withSearchParam(
  inputUrl: URL,
  search: string | null | undefined
): URL {
  const url = new URL(inputUrl.toString());
  const term = (search ?? "").trim();

  if (term) {
    url.searchParams.set("search", term);
  } else {
    url.searchParams.delete("search");
  }

  return url;
}

export function getSearchParam(inputUrl: URL): string {
  return inputUrl.searchParams.get("search") ?? "";
}
