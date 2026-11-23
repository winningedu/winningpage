/** COPY_TEXT keeps its <br> markup (types.ts pages note). */
export const LINE_BREAK = /<br\s*\/?>/i;

/** One-line form of a copy string, for places that cannot hold a line break (SVG text, aria labels). */
export const joinCopyLines = (text: string) => text.split(LINE_BREAK).join(" ");
