// One line of lesson text: `code` spans and **bold**, nothing else. Choice labels, hints, feedback
// and explanations use it, so the browser never needs a Markdown parser to show a check's result.
// Text is rendered as React text, never as HTML.

const TOKEN = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;

export function InlineText({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
        if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        return part;
      })}
    </>
  );
}
