import { Fragment } from "react";
import { LINE_BREAK } from "./lineBreak";

/** Renders a copy string with its <br> markup as line breaks, never as HTML. */
export default function CopyText({ text }: { text: string }) {
  const lines = text.split(LINE_BREAK);
  return (
    <>
      {lines.map((line, index) => (
        // Lines of one fixed string never reorder, so the index is a stable key.
        // biome-ignore lint/suspicious/noArrayIndexKey: static split of one string
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
