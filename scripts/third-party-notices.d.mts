export const HAND_SECTIONS: string;
export function renderNotices(
  json: Record<
    string,
    Array<{
      name: string;
      versions?: string[];
      version?: string;
      author?: string;
      homepage?: string;
    }>
  >,
): string;
